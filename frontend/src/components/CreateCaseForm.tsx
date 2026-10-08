import { useRef, useState, type FormEvent } from 'react';
import { Button, DropdownSelect, Radio, TextArea, TextField } from '@kleros/ui-components-library';
import { ApiError, createCase, type Case, type SelectionMethod } from '../api';
import {
  DESCRIPTION_MAX,
  OUTCOME_MAX,
  OUTCOMES_MAX,
  OUTCOMES_MIN,
  PANEL_SIZES,
  TITLE_MAX,
  WINDOW_PARTS,
  emptyDraft,
  errorsFromServer,
  hasErrors,
  toNewCase,
  validateDraft,
  type CaseDraft,
  type DraftErrors,
} from '../cases/draft';

type Props = Readonly<{
  onCreated: (created: Case) => void;
  onCancel: () => void;
  /** The session is gone (401): the app goes back to the login screen. */
  onUnauthorized: () => void;
}>;

/** Outcomes need stable keys while rows are added and removed. */
type OutcomeRow = { key: number; value: string };

function fieldError(message: string | undefined) {
  return message ? { variant: 'error' as const, message, isInvalid: true } : {};
}

export default function CreateCaseForm({ onCreated, onCancel, onUnauthorized }: Props) {
  const initial = emptyDraft();
  const nextKey = useRef(initial.outcomes.length);
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>(initial.outcomes.map((value, key) => ({ key, value })));
  const [voteWindow, setVoteWindow] = useState(initial.window);
  const [panelSize, setPanelSize] = useState(initial.panelSize);
  const [selectionMethod, setSelectionMethod] = useState<SelectionMethod>(initial.selectionMethod);
  // Errors only show after the first submit attempt; then they follow every edit.
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<DraftErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const draft: CaseDraft = {
    title,
    description,
    outcomes: outcomes.map((o) => o.value),
    window: voteWindow,
    panelSize,
    selectionMethod,
  };
  const errors: DraftErrors = { ...(attempted ? validateDraft(draft) : {}), ...serverErrors };

  // Any edit invalidates what the server said about the previous submission.
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setServerErrors({});
      setter(value);
    };
  }

  const setOutcome = (key: number) =>
    edit((value: string) => setOutcomes((rows) => rows.map((r) => (r.key === key ? { ...r, value } : r))));
  const updateOutcomes = edit(setOutcomes);
  const addOutcome = () => updateOutcomes([...outcomes, { key: nextKey.current++, value: '' }]);
  const removeOutcome = (key: number) => updateOutcomes(outcomes.filter((r) => r.key !== key));

  function focusFirstError() {
    // Fields are marked invalid on the next render; focus the first one in document order.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setServerErrors({});
    if (hasErrors(validateDraft(draft))) return focusFirstError();
    setSubmitting(true);
    try {
      onCreated(await createCase(toNewCase(draft)));
    } catch (err) {
      setSubmitting(false);
      if (!(err instanceof ApiError)) return setServerErrors({ general: 'Could not create the case. Try again.' });
      if (err.status === 401) return onUnauthorized();
      if (err.status === 403) return setServerErrors({ general: 'You no longer have permission to create cases.' });
      if (err.status === 422) {
        setServerErrors(errorsFromServer(err.detail, outcomes.length));
        return focusFirstError();
      }
      setServerErrors({ general: 'Could not create the case. Try again.' });
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5" aria-labelledby="new-case-heading">
      <h3 id="new-case-heading" className="text-lg font-semibold">
        New case
      </h3>

      <TextField
        label="Title"
        className="w-full"
        value={title}
        onChange={edit(setTitle)}
        inputProps={{ maxLength: TITLE_MAX }}
        {...fieldError(errors.title)}
      />

      <TextArea
        label="Description"
        className="w-full"
        value={description}
        onChange={edit(setDescription)}
        inputProps={{ maxLength: DESCRIPTION_MAX, rows: 4, className: 'w-full' }}
        resizeY
        {...fieldError(errors.description)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-klerosUIComponentsSecondaryText">
          Possible outcomes ({OUTCOMES_MIN}–{OUTCOMES_MAX})
        </legend>
        {outcomes.map((row, i) => (
          <div key={row.key} className="flex items-start gap-2">
            <TextField
              aria-label={`Outcome ${i + 1}`}
              placeholder={`Option ${i + 1}`}
              className="w-full"
              value={row.value}
              onChange={setOutcome(row.key)}
              inputProps={{ maxLength: OUTCOME_MAX }}
              {...fieldError(errors.outcomes?.[i])}
            />
            <Button
              type="button"
              variant="secondary"
              small
              text="✕"
              aria-label={`Remove outcome ${i + 1}`}
              className="h-[45px]! w-[45px]! shrink-0 px-0!"
              isDisabled={outcomes.length <= OUTCOMES_MIN}
              onPress={() => removeOutcome(row.key)}
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            small
            text={outcomes.length >= OUTCOMES_MAX ? `Maximum ${OUTCOMES_MAX} outcomes` : '+ Add outcome'}
            isDisabled={outcomes.length >= OUTCOMES_MAX}
            onPress={addOutcome}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-describedby="window-help">
        <legend className="mb-1 text-sm text-klerosUIComponentsSecondaryText">Voting window</legend>
        <div className="flex flex-wrap items-start gap-4">
          {WINDOW_PARTS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <TextField
                aria-label={label}
                className="w-20"
                value={voteWindow[key]}
                onChange={edit((value: string) => setVoteWindow((w) => ({ ...w, [key]: value })))}
                inputProps={{ inputMode: 'numeric' }}
                // Red border only: the error icon would cover the digits of these narrow inputs.
                isInvalid={errors.windowParts?.includes(key)}
              />
              <span aria-hidden="true">{label.toLowerCase()}</span>
            </div>
          ))}
        </div>
        {errors.window && (
          <p role="alert" className="text-sm text-klerosUIComponentsError">
            {errors.window}
          </p>
        )}
        <p id="window-help" className="text-sm text-klerosUIComponentsSecondaryText">
          Each juror has this long to vote, starting when they are drawn.
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-1">
          <DropdownSelect
            label="Jurors"
            items={PANEL_SIZES.map((n) => ({ id: n, text: String(n), itemValue: n }))}
            selectedKey={panelSize}
            callback={(item) => edit(setPanelSize)(Number(item.id))}
          />
          <span className="text-sm text-klerosUIComponentsSecondaryText">{PANEL_SIZES.join(', ')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Radio
            groupLabel="Selection"
            small
            value={selectionMethod}
            onChange={edit((value: string) => setSelectionMethod(value as SelectionMethod))}
            options={[
              { label: 'Random draw', value: 'random' },
              { label: 'Manual selection', value: 'manual' },
            ]}
          />
          <span className="text-sm text-klerosUIComponentsSecondaryText">
            Jurors are drawn or assigned in a later step.
          </span>
        </div>
      </div>

      {errors.general && (
        <p
          role="alert"
          className="rounded-base border border-klerosUIComponentsError bg-klerosUIComponentsErrorLight px-3 py-2 text-sm text-klerosUIComponentsError"
        >
          {errors.general}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" text="Cancel" isDisabled={submitting} onPress={onCancel} />
        <Button
          type="submit"
          text={submitting ? 'Creating…' : 'Create case'}
          isLoading={submitting}
          isDisabled={submitting}
        />
      </div>
    </form>
  );
}
