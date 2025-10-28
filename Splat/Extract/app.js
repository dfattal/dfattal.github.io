import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SupersplatDownloader() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');

  const handleDownload = async () => {
    try {
      const idMatch = url.match(/id=([a-zA-Z0-9]+)/);
      if (!idMatch) {
        setStatus('❌ Invalid URL');
        return;
      }

      const id = idMatch[1];
      const base = `https://d28zzqy0iyovbz.cloudfront.net/${id}/v1`;
      const files = [
        'meta.json',
        'means_l.webp',
        'means_u.webp',
        'quats.webp',
        'scales.webp',
        'sh0.webp',
        'shN_centroids.webp',
        'shN_labels.webp',
      ];

      setStatus('⬇️ Downloading...');

      for (const f of files) {
        const fileUrl = `${base}/${f}`;
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${f}`);

        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      setStatus(`✅ Download complete for model ${id}`);
    } catch (err) {
      console.error(err);
      setStatus('❌ Download failed. Check console for details.');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-6 max-w-md mx-auto bg-white rounded-2xl shadow">
      <h2 className="text-xl font-semibold">SuperSplat Downloader</h2>
      <Input
        placeholder="Paste Supersplat view URL (e.g. https://superspl.at/view?id=4f1af145)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button onClick={handleDownload}>Download Files</Button>
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}