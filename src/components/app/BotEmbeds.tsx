import type { z } from "zod";
import type { botEmbedSchema } from "@/lib/botContracts";

export function BotEmbeds({
  embeds,
}: {
  embeds?: z.infer<typeof botEmbedSchema>[];
}) {
  return (
    <>
      {embeds?.map((embed, index) => (
        <article
          key={index}
          className="my-2 max-w-xl rounded-lg border border-border border-l-4 bg-panel p-4"
          style={{ borderLeftColor: embed.color ?? "#5865F2" }}
        >
          {embed.title && (
            <h3 className="font-semibold">
              {embed.url?.startsWith("https://") ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {embed.title}
                </a>
              ) : (
                embed.title
              )}
            </h3>
          )}
          {embed.description && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {embed.description}
            </p>
          )}
          {!!embed.fields?.length && (
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {embed.fields.map((field, i) => (
                <div
                  key={i}
                  className={field.inline ? "min-w-0" : "col-span-2"}
                >
                  <dt className="break-words text-xs font-semibold">
                    {field.name}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </article>
      ))}
    </>
  );
}
