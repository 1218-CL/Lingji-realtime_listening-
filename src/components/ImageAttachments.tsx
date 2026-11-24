import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { compressImage } from "../lib/images";
import { useToast } from "../context/ToastContext";
import type { LectureImage } from "../types";

interface ImageAttachmentsProps {
  lectureId: string;
  images: LectureImage[];
  onChange: (images: LectureImage[]) => void;
  onUploaded?: () => void;
  disabled?: boolean;
  max?: number;
}

export function ImageAttachments({
  lectureId,
  images,
  onChange,
  onUploaded,
  disabled = false,
  max = 6,
}: ImageAttachmentsProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState("");

  const pick = () => {
    if (disabled || uploading || images.length >= max) return;
    inputRef.current?.click();
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = max - images.length;
    const selected = Array.from(files).slice(0, remaining);
    if (!selected.length) return;
    setUploading(true);
    const uploaded: LectureImage[] = [];
    try {
      for (const file of selected) {
        const compressed = await compressImage(file);
        const result = await api.uploadImage(
          lectureId,
          compressed.blob,
          compressed.mime,
        );
        uploaded.push(result.image);
        onChange([...images, ...uploaded]);
      }
      if (uploaded.length) {
        showToast(
          `已添加 ${uploaded.length} 张图片，会随下一次纪要分析一起使用。`,
          "success",
        );
        onUploaded?.();
      }
    } catch (err) {
      showToast(errorMessage(err), "error");
      if (uploaded.length) onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (image: LectureImage) => {
    if (removing) return;
    setRemoving(image.id);
    try {
      await api.deleteImage(lectureId, image.id);
      onChange(images.filter((item) => item.id !== image.id));
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setRemoving("");
    }
  };

  return (
    <div className={`image-attachments ${images.length ? "has-images" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        hidden
        onChange={(event) => void uploadFiles(event.target.files)}
      />
      <div className="image-attachment-list">
        {images.map((image) => (
          <div className="image-thumb" key={image.id}>
            <a href={image.url} target="_blank" rel="noreferrer" title="查看大图">
              <img src={image.url} alt="课堂板书图片" />
            </a>
            <button
              onClick={() => void remove(image)}
              disabled={Boolean(removing)}
              aria-label="移除这张图片"
              title="移除图片"
            >
              {removing === image.id ? (
                <LoaderCircle size={12} className="spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
          </div>
        ))}
        {images.length < max && (
          <button
            className="image-add"
            onClick={pick}
            disabled={disabled || uploading}
            title="添加板书、幻灯片或教材照片"
          >
            {uploading ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ImagePlus size={17} />
            )}
            <span>{uploading ? "上传中" : "加图片"}</span>
          </button>
        )}
      </div>
      <p className="image-attachment-hint">
        板书 / PPT 照片可辅助 AI 理解；最新 2 张参与分析，仅自己可见。
      </p>
    </div>
  );
}
