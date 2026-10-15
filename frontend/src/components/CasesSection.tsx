import { Button } from '@kleros/ui-components-library';
import { Link, useNavigate } from 'react-router-dom';
import { listCases } from '../api';
import { resultLabel } from '../cases/presentation';
import { useCaseRead } from '../cases/useCaseRead';
import CaseStatusBadge from './CaseStatusBadge';
import CreateCaseForm from './CreateCaseForm';

type Props = Readonly<{ canCreate: boolean; onUnauthorized: () => void }>;
const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground';

function CaseList({ canCreate, onUnauthorized }: Props) {
  const navigate = useNavigate();
  const { state, retry } = useCaseRead(listCases, onUnauthorized);
  return (
    <section aria-labelledby="cases-heading" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 id="cases-heading" className="text-2xl font-semibold">
            Cases
          </h1>
          <p className="mt-2 text-sm text-klerosUIComponentsSecondaryText">Cases visible to you · Newest first</p>
        </div>
        <Button
          text="New case"
          isDisabled={!canCreate}
          aria-describedby={canCreate ? undefined : 'new-case-hint'}
          onPress={() => navigate('/cases/new')}
        />
      </div>
      {!canCreate && (
        <p id="new-case-hint" className="text-sm text-klerosUIComponentsSecondaryText">
          Only creators and admins can create cases.
        </p>
      )}
      {state.kind === 'loading' && (
        <p role="status" className={`${card} p-6`}>
          Loading cases…
        </p>
      )}
      {(state.kind === 'error' || state.kind === 'missing') && (
        <div className={`${card} flex flex-col items-start gap-4 p-6`}>
          <p role="alert">Could not load cases. Please try again.</p>
          <Button text="Retry" variant="secondary" onPress={retry} />
        </div>
      )}
      {state.kind === 'ready' &&
        (state.data.length === 0 ? (
          <div className={`${card} border-dashed p-10 text-center`}>
            <h2 className="text-lg font-semibold">No cases to show</h2>
            <p className="mt-2 text-sm text-klerosUIComponentsSecondaryText">
              {canCreate ? 'Create a case to get started.' : 'Cases you created or are assigned to will appear here.'}
            </p>
          </div>
        ) : (
          <ul aria-label="Cases" className={`${card} divide-y divide-klerosUIComponentsStroke overflow-hidden`}>
            {state.data.map((c) => (
              <li key={c.id}>
                <Link to={`/cases/${c.id}`} className="block p-6 hover:bg-klerosUIComponentsMediumPurple">
                  <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
                    <span className="break-words text-lg font-semibold text-klerosUIComponentsPrimaryPurple">
                      {c.title}
                    </span>
                    <CaseStatusBadge status={c.status} />
                  </div>
                  <p className="mt-2 text-sm text-klerosUIComponentsSecondaryText">
                    #{c.id} · Created {new Date(c.createdAt).toLocaleString()}
                  </p>
                  {c.status === 'resolved' && <p className="mt-2">Result: {resultLabel(c.result)}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export function NewCase({ canCreate, onUnauthorized }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-5">
      <Link to="/cases" className="text-klerosUIComponentsPrimaryPurple underline">
        ← Back to cases
      </Link>
      <div className={`${card} p-6`}>
        {canCreate ? (
          <CreateCaseForm
            onCreated={(created) => navigate(`/cases/${created.id}`, { replace: true, state: { created } })}
            onCancel={() => navigate('/cases')}
            onUnauthorized={onUnauthorized}
          />
        ) : (
          <p role="alert">Only creators and admins can create cases.</p>
        )}
      </div>
    </div>
  );
}

export default function CasesSection(props: Props) {
  return <CaseList {...props} />;
}
