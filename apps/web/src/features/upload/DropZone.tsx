import { useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { UPLOAD_LIMITS } from "@mdiw/shared";
import { formatBytes } from "../../lib/format";
import { ACCEPT_ATTRIBUTE } from "./validateSelection";

interface DropZoneProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * A drop target that is also a real button: click, Enter or Space opens the file picker.
 * The native input stays in the DOM (hidden) so the picker honours `accept` and `multiple`.
 */
export function DropZone({ disabled, onFiles }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so choosing the same file again still fires `change`.
    event.target.value = "";
    if (files.length > 0) onFiles(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (!disabled) setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div className="dropzone-wrap">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        hidden
        aria-label="Choose files to upload"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        className={`dropzone${dragging ? " dropzone--active" : ""}`}
        onClick={openPicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        aria-describedby={hintId}
      >
        <span className="dropzone__title">{dragging ? "Drop to add files" : "Drag files here or choose files"}</span>
        <span className="dropzone__hint" id={hintId}>
          {UPLOAD_LIMITS.allowedExtensions.join(", ")} · up to {UPLOAD_LIMITS.maxFiles} files ·{" "}
          {formatBytes(UPLOAD_LIMITS.maxFileBytes)} each
        </span>
      </button>
    </div>
  );
}
