import { promptDialog } from '../shell/notices';

export const promptForText = (label: string, defaultValue?: string) =>
  promptDialog({ title: label.replace(/:$/, ''), defaultValue });
