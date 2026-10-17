import { describe, expect, it } from 'vitest';
import { githubImageUrls } from './issue-images';

const A = 'https://github.com/user-attachments/assets/98cb028f-3a3d-45cb-a534-a53b897c6065';
const B = 'https://github.com/user-attachments/assets/6a989651-a0fc-486a-a308-0acf93557931';

describe('githubImageUrls', () => {
  it('รูปจาก <img> (แบบที่ GitHub ใส่ตอนวางรูป) และ ![]() · ไม่ซ้ำ · คงลำดับ', () => {
    const md = [
      `<img width="846" height="474" alt="Image" src="${A}" />`,
      `![shot](${B} "title")`,
      `![again](${A})`,
    ].join('\n\n');
    expect(githubImageUrls(md)).toEqual([B, A]);
  });

  it('รูปสาธารณะ / ลิงก์ไฟล์ที่ไม่ใช่รูป / http ไม่นับ', () => {
    const md = [
      '![logo](https://example.com/logo.png)',
      '[card.md](https://github.com/user-attachments/files/33524449/card.md)',
      '<img src="http://github.com/user-attachments/assets/x">',
    ].join('\n');
    expect(githubImageUrls(md)).toEqual([]);
    expect(githubImageUrls(null)).toEqual([]);
  });
});
