import { createUnflagReact } from 'unflag/react';
import { supportDeskFeatures } from './supportDesk.features';

export const { UnflagProvider, useFeatures, useUnflag } = createUnflagReact(supportDeskFeatures);
