import { render } from '@react-email/render';
import {
  budgetAlert,
  dailyDigest,
  reminderEmail,
  resetPassword,
  securityAlert,
  verifyEmail,
  weeklyReview,
  type BudgetAlertProps,
  type DailyDigestProps,
  type ReminderEmailProps,
  type ResetPasswordProps,
  type SecurityAlertProps,
  type VerifyEmailProps,
  type WeeklyReviewProps,
} from './templates';

export interface EmailPropsByKind {
  verifyEmail: VerifyEmailProps;
  resetPassword: ResetPasswordProps;
  securityAlert: SecurityAlertProps;
  dailyDigest: DailyDigestProps;
  weeklyReview: WeeklyReviewProps;
  budgetAlert: BudgetAlertProps;
  reminder: ReminderEmailProps;
}
export type EmailKind = keyof EmailPropsByKind;

export interface RenderedEmail {
  subject: string;
  html: string;
  /** ฉบับข้อความล้วน — โปรแกรมอ่านอีเมลบางตัวและตัวกรองสแปมใช้ */
  text: string;
}

type Template<P> = { subject: (props: P) => string; Component: (props: P) => React.ReactElement };

const TEMPLATES: { [K in EmailKind]: Template<EmailPropsByKind[K]> } = {
  verifyEmail,
  resetPassword,
  securityAlert,
  dailyDigest,
  weeklyReview,
  budgetAlert,
  reminder: reminderEmail,
};

export async function renderEmail<K extends EmailKind>(
  kind: K,
  props: EmailPropsByKind[K],
): Promise<RenderedEmail> {
  const template = TEMPLATES[kind] as Template<EmailPropsByKind[K]>;
  const element = template.Component(props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: template.subject(props), html, text };
}
