'use client';
export default function ErrorPage({ reset }: {
    error: Error;
    reset: () => void;
}) { return <div style={{ padding: 60, textAlign: 'center' }}><h2>书页暂时没有展开</h2><p>操作失败，已保存的本地数据不受页面错误影响。</p><button className="primary" onClick={reset}>重新打开</button></div>; }
