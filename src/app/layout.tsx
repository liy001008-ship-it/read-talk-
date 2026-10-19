import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '知间 · Between Pages', description: '让阅读，成为思想的发生地。个人学术阅读与研究工作台。' };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="zh-CN"><body>{children}</body></html>; }
