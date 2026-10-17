/**
 * รูปใน description ของงานที่ต้องเปิดด้วยสิทธิ์ GitHub — รูปแนบ (user-attachments) และ private-user-images
 * ของ repo ส่วนตัว ฝังในเว็บอื่นไม่ได้ (ไม่มีคุกกี้ GitHub → 404) จึงต้องย่อแล้วเก็บไว้ที่ NOSION
 * คืน URL ตามที่เขียนใน Markdown ทุกตัวอักษร — หน้าเว็บจับคู่ด้วยสตริงเดียวกันนี้
 */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?(https:\/\/[^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const HTML_IMAGE = /<img\b[^>]*?\ssrc\s*=\s*["'](https:\/\/[^"']+)["']/gi;
const GITHUB_PRIVATE =
  /^https:\/\/(github\.com\/user-attachments\/assets\/|private-user-images\.githubusercontent\.com\/)/;

export function githubImageUrls(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const urls = [
    ...[...markdown.matchAll(MARKDOWN_IMAGE)].map((m) => m[1]!),
    ...[...markdown.matchAll(HTML_IMAGE)].map((m) => m[1]!),
  ];
  return [...new Set(urls.filter((u) => GITHUB_PRIVATE.test(u)))];
}
