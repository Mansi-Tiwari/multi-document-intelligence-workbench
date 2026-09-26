import { useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { CreateAnalysisRequest, DocumentSummary } from "@mdiw/shared";
import { EXAMPLE_INSTRUCTIONS } from "@mdiw/shared";
import { INSTRUCTION_MAX, checkAnalysisRequest, validateInstruction } from "./instruction";

interface InstructionFormProps {
  selected: readonly DocumentSummary[];
  pending: boolean;
  onDeselect: (documentId: string) => void;
  onSubmit: (request: CreateAnalysisRequest) => void;
}

export function InstructionForm({ selected, pending, onDeselect, onSubmit }: InstructionFormProps) {
  const [instruction, setInstruction] = useState("");
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ids = { textarea: useId(), error: useId(), counter: useId(), reason: useId() };

  const instructionError = validateInstruction(instruction);
  const tooLong = instruction.trim().length > INSTRUCTION_MAX;
  const showInstructionError = instructionError !== null && (touched || tooLong);
  const check = checkAnalysisRequest(
    instruction,
    selected.map((d) => d.id),
  );

  const submit = () => {
    setTouched(true);
    if (!check.ok || pending) return;
    onSubmit(check.request);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const describedBy = [ids.counter, showInstructionError ? ids.error : null].filter((id) => id !== null).join(" ");

  return (
    <form className="instruction-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={ids.textarea} className="field__label">
          Instruction
        </label>
        <textarea
          id={ids.textarea}
          ref={textareaRef}
          className="field__textarea"
          rows={4}
          value={instruction}
          placeholder="e.g. Compare payment terms and totals"
          onChange={(event) => {
            setInstruction(event.target.value);
          }}
          onBlur={() => {
            if (instruction !== "") setTouched(true);
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={showInstructionError}
          aria-describedby={describedBy}
        />
        <div className="field__footer">
          {showInstructionError ? (
            <p className="inline-error" id={ids.error}>
              {instructionError}
            </p>
          ) : (
            <p className="field__hint">Press Ctrl+Enter (⌘+Enter on Mac) to analyze.</p>
          )}
          <p className={`field__counter${tooLong ? " field__counter--over" : ""}`} id={ids.counter}>
            {instruction.length} / {INSTRUCTION_MAX}
            <span className="visually-hidden"> characters</span>
          </p>
        </div>
      </div>

      <div className="chip-group">
        <p className="chip-group__label">Examples</p>
        <ul className="chips">
          {EXAMPLE_INSTRUCTIONS.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="chip chip--button"
                onClick={() => {
                  setInstruction(example);
                  setTouched(false);
                  textareaRef.current?.focus();
                }}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="chip-group">
        <p className="chip-group__label">Selected documents ({selected.length})</p>
        {selected.length === 0 ? (
          <p className="empty-note">None yet. Tick documents in the Documents list.</p>
        ) : (
          <ul className="chips">
            {selected.map((doc) => (
              <li key={doc.id} className="chip">
                <span className="chip__text">{doc.filename}</span>
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => {
                    onDeselect(doc.id);
                  }}
                  aria-label={`Remove ${doc.filename} from analysis`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={!check.ok || pending}
          aria-describedby={check.ok ? undefined : ids.reason}
          aria-busy={pending}
        >
          {pending ? "Analyzing…" : "Analyze"}
        </button>
        {!check.ok && !pending && (
          <p className="actions__note" id={ids.reason}>
            {check.reason}
          </p>
        )}
        {pending && (
          <p className="actions__note" role="status">
            Analyzing {selected.length} {selected.length === 1 ? "document" : "documents"}. This can take a moment.
          </p>
        )}
      </div>
    </form>
  );
}
