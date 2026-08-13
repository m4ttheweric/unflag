import { createUnflagReact } from '@m4ttheweric/unflag/react';
import { supportDeskFeatures } from './supportDesk.features';

export const { UnflagProvider, useFeatures, useUnflag } = createUnflagReact(supportDeskFeatures);
