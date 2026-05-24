import { useState, useCallback } from "react";

interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const upload = useCallback(async (file: File): Promise<UploadedFile | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const result: UploadedFile = { name: data.name, path: data.path, size: data.size };
      setUploadedFiles((prev) => [...prev, result]);
      return result;
    } catch (e) {
      console.error("Upload error:", e);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const clearFiles = useCallback(() => setUploadedFiles([]), []);

  return { uploading, uploadedFiles, upload, clearFiles };
}
