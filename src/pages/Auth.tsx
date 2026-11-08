import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { KyroMark } from "@/components/KyroMark";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "@/components/icons";
import { Link } from "react-router";
import { useAction, useMutation } from "convex/react";
import {
  forgetAccount,
  rememberAccount,
  rememberedAccounts,
} from "@/lib/accounts";

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Step = "signIn" | "register" | "verifyEmail" | "forgot" | "reset";

function Auth({ redirectAfterAuth }: { redirectAfterAuth?: string }) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  // `users/createAccount.ts` nests one level deeper in the generated API.
  const createAccountAction = useAction(api.users.createAccount.createAccount);
  // Fallback path for deployments that predate the custom createAccount action:
  // Convex Auth can create the credential account itself, then we reserve the
  // handle with the long-standing claimProfile mutation.
  const claimProfile = useMutation(api.users.claimProfile);
  const requestCodeAction = useAction(api.passwordReset.requestCode);
  const resetPasswordAction = useAction(api.passwordReset.resetPassword);
  const requestVerificationAction = useAction(
    api.emailVerification.requestCode,
  );
  const verifyEmailAction = useAction(api.emailVerification.verifyCode);
  const [step, setStep] = React.useState<Step>("signIn");
  const [email, setEmail] = React.useState(
    () => searchParams.get("email")?.trim().toLowerCase() ?? "",
  );
  const [accounts, setAccounts] = React.useState(rememberedAccounts);
  const [password, setPassword] = React.useState("");
  const [twoFactorRequired, setTwoFactorRequired] = React.useState(false);
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  // Forgot-password flow: email → emailed code → new password.
  const [resetCode, setResetCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [verificationCode, setVerificationCode] = React.useState("");

  React.useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleSignInSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const signInEmail = String(formData.get("email") ?? "")
        .trim()
        .toLowerCase();
      const signInPassword = String(formData.get("password") ?? "");
      if (!signInPassword) {
        setError("Enter your password.");
        setIsLoading(false);
        return;
      }
      await signIn("password", {
        flow: "signIn",
        email: signInEmail,
        password: signInPassword,
        ...(twoFactorCode.trim() ? { code: twoFactorCode.trim() } : {}),
      });
      rememberAccount({ email: signInEmail });
      toast.success("Welcome back!");
      navigate(redirect);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("TWO_FACTOR_REQUIRED")) {
        setTwoFactorRequired(true);
        setTwoFactorCode("");
        setError(null);
      } else if (message.includes("INVALID_TWO_FACTOR_CODE")) {
        setTwoFactorRequired(true);
        setError("That authenticator or recovery code isn't valid.");
      } else if (message.includes("EMAIL_VERIFICATION_REQUIRED")) {
        setVerificationCode("");
        setStep("verifyEmail");
        setError("Verify your email to finish signing in.");
      } else {
        console.error("Password sign-in error:", err);
        setError("That email and password combination didn't work.");
      }
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const handle = username.trim().toLowerCase();
    const displayNameValue = displayName.trim() || handle;
    try {
      if (!USERNAME_PATTERN.test(handle)) {
        setError(
          "Pick a username using only letters, numbers and underscores.",
        );
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (confirmPassword !== password) {
        setError("Passwords do not match.");
        return;
      }

      try {
        const created = await createAccountAction({
          email: normalizedEmail,
          password,
          username: handle,
          name: displayNameValue,
        });
        if (created.verificationRequired) {
          setVerificationCode("");
          setStep("verifyEmail");
          toast.success(
            created.verificationQueued
              ? "Account created — check your email for the verification code."
              : "Account created. Use Resend code to request verification email delivery.",
          );
          return;
        }
        await signIn("password", {
          flow: "signIn",
          email: normalizedEmail,
          password,
        });
        rememberAccount({
          email: normalizedEmail,
          name: displayNameValue,
          username: handle,
        });
        toast.success("Account created — welcome to Kyro!");
        navigate(redirect);
        return;
      } catch (createError) {
        const message =
          createError instanceof Error
            ? createError.message
            : String(createError);
        const actionNotDeployed =
          message.includes("Could not find public function") &&
          message.toLowerCase().includes("createaccount");
        if (!actionNotDeployed) throw createError;

        // The backend is older than this client. Use the password provider's
        // own signUp flow, then claim the handle. If the handle turns out to
        // be taken, the dashboard's claim screen lets the member pick another
        // one — the account itself is still created.
        await signIn("password", {
          flow: "signUp",
          email: normalizedEmail,
          password,
        });
        rememberAccount({
          email: normalizedEmail,
          name: displayNameValue,
          username: handle,
        });
        try {
          await claimProfile({ username: handle, name: displayNameValue });
        } catch {
          toast.error("Account created — pick your username to finish.");
          navigate(redirect);
          return;
        }
        toast.success("Account created — welcome to Kyro!");
        navigate(redirect);
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const startRegister = () => {
    setStep("register");
    setError(null);
    setTwoFactorRequired(false);
    setTwoFactorCode("");
    setVerificationCode("");
  };

  const startSignIn = () => {
    setStep("signIn");
    setError(null);
    setTwoFactorRequired(false);
    setTwoFactorCode("");
    setVerificationCode("");
  };

  const startForgotPassword = () => {
    setStep("forgot");
    setError(null);
  };

  /** Step 1 of recovery: ask for a code, then move to the code screen. */
  const sendResetCode = async () => {
    setIsLoading(true);
    setError(null);
    const target = email.trim().toLowerCase();
    try {
      const result = await requestCodeAction({ email: target });
      if (result.throttled) {
        setError(
          "Too many codes requested for this email — wait a minute, then try again.",
        );
        return;
      }
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      setStep("reset");
      toast.success(
        "If that email has a Kyro account, a reset code will be sent shortly.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendResetCode();
  };

  const resendVerificationCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestVerificationAction({
        email: email.trim().toLowerCase(),
      });
      if (result.throttled) {
        setError("Please wait before requesting another verification code.");
        return;
      }
      toast.success(
        "If this address is awaiting verification, a new code will be sent shortly.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't request another code.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verificationCode.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await verifyEmailAction({
        email: normalizedEmail,
        code: verificationCode,
      });
      await signIn("password", {
        flow: "signIn",
        email: normalizedEmail,
        password,
      });
      rememberAccount({
        email: normalizedEmail,
        name: displayName.trim() || username.trim() || undefined,
        username: username.trim().toLowerCase() || undefined,
      });
      toast.success("Email verified — welcome to Kyro!");
      navigate(redirect);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not verify that code.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  /** Step 2 of recovery: code + new password. Signs in on success. */
  const handleResetPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsLoading(false);
      return;
    }
    if (confirmNewPassword !== newPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }
    try {
      await resetPasswordAction({
        email: email.trim().toLowerCase(),
        code: resetCode,
        newPassword,
      });
      toast.success("Password updated — you're back in.");
      try {
        await signIn("password", {
          flow: "signIn",
          email: email.trim().toLowerCase(),
          password: newPassword,
        });
        navigate(redirect);
        return;
      } catch (signInError) {
        // Sessions were invalidated by the reset; fall back to the form.
        setStep("signIn");
        setPassword(newPassword);
        const message =
          signInError instanceof Error
            ? signInError.message
            : String(signInError);
        if (message.includes("TWO_FACTOR_REQUIRED")) {
          setTwoFactorRequired(true);
          setTwoFactorCode("");
          setError("Password changed. Enter your second factor to finish.");
        } else if (message.includes("EMAIL_VERIFICATION_REQUIRED")) {
          setVerificationCode("");
          setStep("verifyEmail");
          setError("Password changed. Verify your email to finish.");
        } else {
          setError("Password changed — sign in with your new password.");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't reset the password.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-surface p-12 lg:flex lg:w-[46%] lg:flex-col lg:justify-between">
        <div className="kyro-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="kyro-orb pointer-events-none absolute -left-24 top-1/3 h-80 w-80" />

        <Link
          to="/"
          className="relative flex items-center gap-2.5 text-lg font-bold tracking-tight"
        >
          <KyroMark className="size-9" />
          Kyro
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
            Connect. Play. <span className="kyro-gradient-text">Belong.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Communities, channels, friends, roles and moderation — the whole
            platform, free for everyone, with nothing to upgrade to.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              "Unlimited communities, messages and uploads",
              "Every moderation tool, included for all",
              "No subscriptions and no premium tier",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-[10px] font-bold text-success">
                  <Check className="size-3" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Free forever · no paywalled features · your data stays yours
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md border shadow-md">
          {step === "signIn" ? (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    aria-label="Back to the Kyro home page"
                    className="cursor-pointer"
                  >
                    <KyroMark className="mb-4 mt-4 size-14" />
                  </button>
                </div>
                <CardTitle className="text-xl">Welcome to Kyro</CardTitle>
                <CardDescription>
                  Sign in with your password, or create a free account — no
                  email code required.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSignInSubmit}>
                <CardContent className="space-y-4">
                  {(searchParams.get("switch") === "1" ||
                    accounts.length > 1) &&
                    accounts.length > 0 && (
                      <div className="space-y-2">
                        <Label>Saved accounts</Label>
                        <div className="space-y-1.5 rounded-lg border border-border/70 bg-surface p-2">
                          {accounts.map((account) => (
                            <div
                              key={account.email}
                              className="flex items-center gap-2"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEmail(account.email);
                                  setTwoFactorRequired(false);
                                  setTwoFactorCode("");
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById("signin-password")
                                      ?.focus(),
                                  );
                                }}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel"
                              >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold uppercase text-primary">
                                  {(account.name ?? account.email).slice(0, 1)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  {account.name && (
                                    <span className="block truncate text-sm font-medium">
                                      {account.name}
                                    </span>
                                  )}
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {account.email}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Forget ${account.email}`}
                                onClick={() => {
                                  forgetAccount(account.email);
                                  setAccounts(rememberedAccounts());
                                }}
                                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Kyro remembers account names and email addresses
                          only—never passwords.
                        </p>
                      </div>
                    )}
                  <div>
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setTwoFactorRequired(false);
                          setTwoFactorCode("");
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Your password"
                        className="pl-9 pr-9"
                        disabled={isLoading}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {twoFactorRequired && (
                    <div>
                      <Label htmlFor="signin-two-factor">
                        Authenticator or recovery code
                      </Label>
                      <Input
                        id="signin-two-factor"
                        name="code"
                        value={twoFactorCode}
                        onChange={(event) =>
                          setTwoFactorCode(event.target.value.toUpperCase())
                        }
                        placeholder="123456 or XXXX-XXXX"
                        autoComplete="one-time-code"
                        autoFocus
                        disabled={isLoading}
                        required
                      />
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Open your authenticator app, or use one unused recovery
                        code.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={startForgotPassword}
                      disabled={isLoading}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {twoFactorRequired ? "Verify and sign in" : "Sign in"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    New to Kyro?{" "}
                    <button
                      type="button"
                      onClick={startRegister}
                      disabled={isLoading}
                      className="font-medium text-primary hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                </CardContent>
              </form>
              <div className="rounded-b-lg border-t bg-muted px-6 py-4 text-center text-xs text-muted-foreground">
                Kyro is free forever ·{" "}
                <Link
                  to="/terms"
                  className="underline transition-colors hover:text-primary"
                >
                  Terms
                </Link>{" "}
                ·{" "}
                <Link
                  to="/privacy"
                  className="underline transition-colors hover:text-primary"
                >
                  Privacy
                </Link>
              </div>
            </>
          ) : step === "register" ? (
            <>
              <CardHeader className="text-center -mt-6">
                <CardTitle className="text-xl">Create your account</CardTitle>
                <CardDescription>
                  Pick a username and password, then verify your email once.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@kairo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password-input"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        className="pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="yourname"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      required
                      autoComplete="username"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Letters, numbers and underscores only, 3–32 characters.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="display-name">
                      Display name (optional)
                    </Label>
                    <Input
                      id="display-name"
                      placeholder="How others see you"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={isLoading}
                      autoComplete="name"
                    />
                  </div>
                </CardContent>
                <div className="space-y-3">
                  {error && (
                    <p
                      role="alert"
                      aria-live="polite"
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-500"
                    >
                      {error}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={startSignIn}
                      disabled={isLoading}
                    >
                      Back to sign-in
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Create account
                    </Button>
                  </div>
                </div>
              </form>
            </>
          ) : step === "verifyEmail" ? (
            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <CardHeader className="text-center -mt-6">
                <CardTitle className="text-xl">Verify your email</CardTitle>
                <CardDescription>
                  Enter the 6-digit code sent to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  It expires in 10 minutes and works once.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="verification-code">Verification code</Label>
                  <Input
                    id="verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="text-center text-lg font-semibold tracking-[0.4em]"
                    disabled={isLoading}
                    required
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                  />
                </div>
                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-500"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Verify and continue
                </Button>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isLoading}
                    onClick={startSignIn}
                  >
                    Back to sign-in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => void resendVerificationCode()}
                  >
                    Resend code
                  </Button>
                </div>
              </CardContent>
            </form>
          ) : step === "forgot" ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <CardHeader className="text-center -mt-6">
                <CardTitle className="text-xl">Reset your password</CardTitle>
                <CardDescription>
                  Enter the email on your Kyro account and we'll send you a
                  6-digit code.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      name="email"
                      type="email"
                      placeholder="name@example.com"
                      className="pl-9"
                      disabled={isLoading}
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
              </CardContent>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={startSignIn}
                  disabled={isLoading}
                >
                  Back to sign-in
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send code
                </Button>
              </div>
            </form>
          ) : step === "reset" ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <CardHeader className="text-center -mt-6">
                <CardTitle className="text-xl">Enter your code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  It expires in 10 minutes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="reset-code">6-digit code</Label>
                  <Input
                    id="reset-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="text-center text-lg font-semibold tracking-[0.4em]"
                    disabled={isLoading}
                    required
                    value={resetCode}
                    onChange={(e) =>
                      setResetCode(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="reset-password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reset-password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      className="pl-9 pr-9"
                      disabled={isLoading}
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={
                        showNewPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showNewPassword}
                    >
                      {showNewPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="reset-confirm">Confirm new password</Label>
                  <Input
                    id="reset-confirm"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    disabled={isLoading}
                    required
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
              </CardContent>
              <div className="space-y-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || resetCode.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Reset password
                </Button>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startForgotPassword}
                    disabled={isLoading}
                  >
                    Use a different email
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void sendResetCode()}
                    disabled={isLoading}
                  >
                    Resend code
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
        </Card>
      </main>
    </div>
  );
}

export default function AuthPage({
  redirectAfterAuth,
}: {
  redirectAfterAuth?: string;
}) {
  return <Auth redirectAfterAuth={redirectAfterAuth} />;
}
