export type JsonSchema = {
  [key: string]: unknown;
};

export type MusicToolContract = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
};

