import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import messages from '../../../messages/th.json';
import { Markdown } from './markdown';

const html = (md: string) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" timeZone="Asia/Bangkok" messages={messages}>
      <Markdown>{md}</Markdown>
    </NextIntlClientProvider>,
  );

describe('Markdown', () => {
  it('GFM แบบ GitHub: หัวข้อ · ตัวหนา · ตาราง · checklist · ลิงก์เปิดแท็บใหม่', () => {
    const out = html(
      [
        '## 1. ภาพรวม',
        'ถ้า **ไม่ติ๊ก** ต้องไม่แสดง',
        '',
        '| # | หน้าจอ |',
        '|---|---|',
        '| 1 | Modal |',
        '',
        '- [x] เสร็จ',
        '- [ ] ยัง',
        '',
        '[card.md](https://github.com/x/card.md)',
      ].join('\n'),
    );
    expect(out).toContain('<h2');
    expect(out).toContain('<strong>ไม่ติ๊ก</strong>');
    expect(out).toContain('<table');
    expect(out).toContain('<td class="border border-hairline px-3 py-1.5 align-top">Modal</td>');
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(out).toMatch(/<a [^>]*href="https:\/\/github.com\/x\/card.md"[^>]*target="_blank"/);
    expect(out).not.toContain('node=');
  });

  it('HTML ที่ GitHub ใส่มา (<img width>) แสดงเป็นรูป · script / on* / javascript: ถูกกรองออก', () => {
    const out = html(
      [
        '<img width="1394" alt="Image" src="https://github.com/user-attachments/assets/abc" />',
        '',
        '<script>alert(1)</script>',
        '<img src="x" onerror="alert(1)">',
        '[คลิก](javascript:alert(1))',
      ].join('\n'),
    );
    expect(out).toMatch(/<img [^>]*src="https:\/\/github.com\/user-attachments\/assets\/abc"/);
    expect(out).toContain('width="1394"');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toMatch(/href="javascript:/);
  });
});
