declare module "nodemailer-secure" {
  import nodemailer from "nodemailer";
  export type Transporter = import("nodemailer").Transporter;
  export default nodemailer;
}
