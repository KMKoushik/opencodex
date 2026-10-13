import { Undo03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelRef } from '@opencodex/contracts';
import type { AppModel } from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { appModelKey } from '../canvas/canvas-context';
import { ModelControls } from '../chat/model-controls';

const SOURCE: Record<AppModel['source'], string> = {
  app: 'App model',
  chat: 'Chat’s model',
  default: 'Default model',
  none: 'No model',
};

/**
 * The model `oc.ask` and `oc.run` use when server.ts names none. Picking one saves it to the
 * app; until then the app follows the chat that made it.
 */
export function AppModelControl({ id, disabled }: { id: string; disabled: boolean }) {
  const client = useQueryClient();
  const current = useQuery({
    queryKey: appModelKey(id),
    queryFn: ({ signal }) => api.appModel(id, signal),
  });
  const directory = current.data?.directory;
  const catalog = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory!, signal),
    enabled: Boolean(directory),
    staleTime: 5 * 60_000,
  });
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
    <div className="apps-model" title="Used by oc.ask and oc.run unless server.ts names a model">
      {source && <span className="apps-model-source">{SOURCE[source]}</span>}
      {source === 'app' && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Use the chat’s model"
          title="Use the chat’s model"
          disabled={disabled || save.isPending}
          onClick={() => save.mutate(null)}
        >
          <HugeiconsIcon icon={Undo03Icon} size={14} />
        </Button>
      )}
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
      {save.error && (
        <span className="apps-model-error" role="alert">
          {save.error.message}
        </span>
      )}
    </div>
  );
}
