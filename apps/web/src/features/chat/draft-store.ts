import { createStore } from 'zustand/vanilla';
import { attachmentLimitError, type ModelRef } from '@opencodex/contracts';
import { EMPTY_ATTACHMENTS, imageAttachment, type DraftAttachment } from './attachments';
import { EMPTY_COMMENTS, reviewPrompt, type ReviewComment } from './review-comments';

type Draft = Readonly<{
  text: string;
  model?: ModelRef;
  attachments?: readonly DraftAttachment[];
  comments?: readonly ReviewComment[];
  revision: number;
}>;
export type DraftSnapshot = Draft & { readonly sessionID: string };
type DraftState = {
  drafts: Readonly<Record<string, Draft | undefined>>;
  projectModels: Readonly<Record<string, ModelRef>>;
  rememberModel: (directory: string, model: ModelRef) => void;
  editText: (sessionID: string, text: string) => void;
  selectModel: (sessionID: string, model: ModelRef) => void;
  attach: (sessionID: string, files: readonly File[]) => string | undefined;
  removeAttachment: (sessionID: string, id: string) => void;
  saveComment: (sessionID: string, comment: ReviewComment) => string | undefined;
  removeComment: (sessionID: string, id: string) => void;
  capture: (sessionID: string) => DraftSnapshot;
  acknowledge: (snapshot: DraftSnapshot) => void;
};

/** Client-owned intent only. API snapshots and request lifecycles stay in Query. */
export function createDraftStore(
  preferences: {
    models?: Readonly<Record<string, ModelRef>>;
    saveModels?: (models: Readonly<Record<string, ModelRef>>) => void;
  } = {},
) {
  // Never reuse a revision, even if a draft is cleared and recreated with identical text.
  let revision = 0;
  return createStore<DraftState>((set, get) => ({
    drafts: {},
    projectModels: preferences.models ?? {},
    rememberModel(directory, model) {
      const current = get().projectModels;
      const previous = current[directory];
      if (
        previous?.id === model.id &&
        previous.providerID === model.providerID &&
        previous.variant === model.variant
      )
        return;
      // Bound the preference payload to the native bridge's limit; oldest projects go first.
      const entries = Object.entries(current).filter(([key]) => key !== directory);
      entries.push([directory, { ...model }]);
      let projectModels = Object.fromEntries(entries);
      while (entries.length > 64 || JSON.stringify(projectModels).length > 16_384) {
        entries.shift();
        projectModels = Object.fromEntries(entries);
      }
      set({ projectModels });
      preferences.saveModels?.(projectModels);
    },
    editText(sessionID, text) {
      set((state) => {
        const current = state.drafts[sessionID];
        if ((current?.text ?? '') === text) return state;
        const drafts = { ...state.drafts };
        if (!text && !current?.model && !current?.attachments?.length && !current?.comments?.length)
          delete drafts[sessionID];
        else drafts[sessionID] = { ...current, text, revision: ++revision };
        return { drafts };
      });
    },
    selectModel(sessionID, model) {
      set((state) => ({
        drafts: {
          ...state.drafts,
          [sessionID]: {
            ...state.drafts[sessionID],
            text: state.drafts[sessionID]?.text ?? '',
            model: { ...model },
            revision: ++revision,
          },
        },
      }));
    },
    attach(sessionID, files) {
      const current = get().drafts[sessionID];
      const existing = current?.attachments ?? EMPTY_ATTACHMENTS;
      if (!files.length) return;
      const error = attachmentLimitError(
        [...existing.map(({ file }) => file), ...files].map((file) => ({
          name: file.name,
          size: file.size,
          image: imageAttachment(file),
        })),
      );
      if (error) return error;
      set((state) => ({
        drafts: {
          ...state.drafts,
          [sessionID]: {
            ...current,
            text: current?.text ?? '',
            revision: ++revision,
            attachments: [...existing, ...files.map((file) => ({ id: crypto.randomUUID(), file }))],
          },
        },
      }));
    },
    removeAttachment(sessionID, id) {
      const current = get().drafts[sessionID];
      if (!current?.attachments?.some((item) => item.id === id)) return;
      const attachments = current.attachments.filter((item) => item.id !== id);
      set((state) => {
        const drafts = { ...state.drafts };
        if (!current.text && !current.model && !attachments.length && !current.comments?.length)
          delete drafts[sessionID];
        else drafts[sessionID] = { ...current, attachments, revision: ++revision };
        return { drafts };
      });
    },
    saveComment(sessionID, comment) {
      const current = get().drafts[sessionID];
      const existing = current?.comments ?? EMPTY_COMMENTS;
      const comments = existing.some((item) => item.id === comment.id)
        ? existing.map((item) => (item.id === comment.id ? comment : item))
        : [...existing, comment];
      if (comments.length > 32)
        return 'Send or remove a comment before adding more (32-comment limit).';
      if (reviewPrompt(current?.text ?? '', comments).length > 200_000)
        return 'The draft is full. Send or shorten it before adding this comment.';
      set((state) => ({
        drafts: {
          ...state.drafts,
          [sessionID]: {
            ...current,
            text: current?.text ?? '',
            comments,
            revision: ++revision,
          },
        },
      }));
    },
    removeComment(sessionID, id) {
      const current = get().drafts[sessionID];
      if (!current?.comments?.some((item) => item.id === id)) return;
      const comments = current.comments.filter((item) => item.id !== id);
      set((state) => {
        const drafts = { ...state.drafts };
        if (!current.text && !current.model && !current.attachments?.length && !comments.length)
          delete drafts[sessionID];
        else drafts[sessionID] = { ...current, comments, revision: ++revision };
        return { drafts };
      });
    },
    capture(sessionID) {
      return { sessionID, ...(get().drafts[sessionID] ?? { text: '', revision: 0 }) };
    },
    acknowledge(snapshot) {
      set((state) => {
        if (state.drafts[snapshot.sessionID]?.revision !== snapshot.revision) return state;
        const drafts = { ...state.drafts };
        delete drafts[snapshot.sessionID];
        return { drafts };
      });
    },
  }));
}
