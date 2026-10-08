import { useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import type { Case } from '../api';
import CaseCreatedCard from './CaseCreatedCard';
import CreateCaseForm from './CreateCaseForm';

type Props = Readonly<{
  /** Creators and admins; mirrors the backend rule. */
  canCreate: boolean;
  onUnauthorized: () => void;
}>;

type View = { kind: 'idle' } | { kind: 'form' } | { kind: 'created'; created: Case };

export default function CasesSection({ canCreate, onUnauthorized }: Props) {
  const [view, setView] = useState<View>({ kind: 'idle' });
  // Remounting the form on every "New case" gives a fresh, empty draft.
  const [formKey, setFormKey] = useState(0);

  function openForm() {
    setFormKey((k) => k + 1);
    setView({ kind: 'form' });
  }

  return (
    <section aria-labelledby="cases-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="cases-heading" className="text-xl font-semibold">
            Cases
          </h2>
          {!canCreate && (
            <p id="new-case-hint" className="text-sm text-klerosUIComponentsSecondaryText">
              Only creators and admins can create cases.
            </p>
          )}
        </div>
        {view.kind !== 'form' && (
          <Button
            text="New case"
            isDisabled={!canCreate}
            aria-describedby={canCreate ? undefined : 'new-case-hint'}
            onPress={openForm}
          />
        )}
      </div>

      {view.kind === 'idle' && (
        <p className="rounded-base border border-dashed border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6 text-center text-klerosUIComponentsSecondaryText">
          Case list coming soon.
        </p>
      )}
      {view.kind !== 'idle' && (
        <div className="rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6">
          {view.kind === 'form' ? (
            <CreateCaseForm
              key={formKey}
              onCreated={(created) => setView({ kind: 'created', created })}
              onCancel={() => setView({ kind: 'idle' })}
              onUnauthorized={onUnauthorized}
            />
          ) : (
            <CaseCreatedCard created={view.created} />
          )}
        </div>
      )}
    </section>
  );
}
