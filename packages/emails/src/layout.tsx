import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

/**
 * โครงอีเมลทุกฉบับ — monochrome ตาม design system (ADR-009) และ inline style เท่านั้น
 * (Gmail/Outlook ตัด <style> และไม่รองรับ CSS variable · ฟอนต์ไทยต้องมีตัวสำรองของระบบ)
 */
export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', 'Sukhumvit Set', Tahoma, sans-serif";

export const color = {
  fg: '#1d1d1f',
  secondary: '#6e6e73',
  hairline: '#e5e5ea',
  sunken: '#f5f5f7',
  danger: '#d70015',
};

export interface LayoutProps {
  /** ข้อความตัวอย่างที่กล่องจดหมายแสดงต่อท้ายหัวเรื่อง */
  preview: string;
  children: ReactNode;
  /** อีเมลแจ้งข่าวสาร (digest ฯลฯ) ต้องมี — อีเมลธุรกรรม (ยืนยัน/รีเซ็ต) ใช้ลิงก์ตั้งค่าแทน */
  unsubscribeUrl?: string;
  settingsUrl: string;
}

export function Layout({ preview, children, unsubscribeUrl, settingsUrl }: LayoutProps) {
  return (
    <Html lang="th">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: color.sunken, fontFamily: FONT, margin: 0, padding: '24px 0' }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${color.hairline}`,
            borderRadius: 16,
            maxWidth: 560,
            padding: '32px 32px 24px',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 24px' }}>
            NOSION
          </Text>
          {children}
          <Hr style={{ borderColor: color.hairline, margin: '32px 0 16px' }} />
          <Text style={{ color: color.secondary, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            ส่งจาก NOSION ·{' '}
            <Link href={settingsUrl} style={{ color: color.secondary }}>
              ตั้งค่าการแจ้งเตือน
            </Link>
            {unsubscribeUrl ? (
              <>
                {' · '}
                <Link href={unsubscribeUrl} style={{ color: color.secondary }}>
                  เลิกรับอีเมลแบบนี้
                </Link>
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: color.fg,
        fontSize: 22,
        fontWeight: 700,
        lineHeight: '30px',
        margin: '0 0 12px',
      }}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        color: muted ? color.secondary : color.fg,
        fontSize: 15,
        lineHeight: '24px',
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '8px 0 16px' }}>
      <Button
        href={href}
        style={{
          backgroundColor: color.fg,
          borderRadius: 10,
          color: '#ffffff',
          fontSize: 15,
          fontWeight: 600,
          padding: '12px 20px',
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** รายการแบบแถว (ชื่อซ้าย ค่าขวา) — ใช้ใน digest / สรุปสัปดาห์ */
export function Row({ label, value, tone }: { label: string; value?: string; tone?: 'danger' }) {
  return (
    <Section style={{ borderBottom: `1px solid ${color.hairline}`, padding: '10px 0' }}>
      <Text
        style={{
          fontSize: 14,
          lineHeight: '20px',
          margin: 0,
          color: tone === 'danger' ? color.danger : color.fg,
        }}
      >
        {label}
        {value ? <span style={{ color: color.secondary, float: 'right' }}>{value}</span> : null}
      </Text>
    </Section>
  );
}
