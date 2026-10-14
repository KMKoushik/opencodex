import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ModelRef } from '@opencodex/contracts';
import type { AppModel } from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { appModelKey } from '../canvas/canvas-context';
import { ModelControls } from '../chat/model-controls';
import { MODEL_SOURCE, useAppModel } from './app-hooks';

/** The app's model by name, for the header; opens the model dialog. */
export function AppModelName({ id, onClick }: { id: string; onClick: () => void }) {
  const { name } = useAppModel(id);
  if (!name) return null;
  return (
    <>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="apps-meta-link"
        title="Change the app’s model"
        onClick={onClick}
      >
        {name}
      </button>
    </>
  );
}

/**
 * Picks the model `oc.ask` and `oc.run` use when server.ts names none. Picking one saves it to
 * the app; until then the app follows the chat that made it.
 */
export function AppModelDialog({
  id,
  disabled,
  onClose,
}: {
  id: string;
  disabled: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const { current, catalog } = useAppModel(id);
  const save = useMutation({
    mutationFn: (model: ModelRef | null) => api.setAppModel(id, model),
    onSuccess: (_, model) => {
      if (model)
        client.setQueryData<AppModel>(appModelKey(id), (previous) =>
          previous ? { ...previous, model, source: 'app' } : previous,
        );
    },
    onSettled: () => client.invalidateQueries({ queryKey: appModelKey(id), exact: true }),
  });
  const source = current.data?.source;
  return (
    <Dialog title="App model" onClose={onClose} className="apps-model-dialog">
      <p className="apps-model-note">
        Used by <code>oc.ask</code> and <code>oc.run</code> unless server.ts names a model.
      </p>
      <div className="apps-model">
        <ModelControls
          shortcuts={false}
          models={catalog.data?.data}
          providers={catalog.data?.providers}
          model={current.data?.model ?? undefined}
          disabled={disabled || !current.data || save.isPending}
          loading={current.isPending || catalog.isPending}
          failed={current.isError || catalog.isError}
          onChange={(model) => save.mutate(model)}
        />
      </div>
      {source && <p className="apps-model-note">{MODEL_SOURCE[source]}</p>}
      {save.error && (
        <p className="text-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="dialog-actions">
        {source === 'app' && (
          <Button
            variant="ghost"
            disabled={disabled || save.isPending}
            onClick={() => save.mutate(null)}
          >
            Use the chat’s model
          </Button>
        )}
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
