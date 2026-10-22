/** Small, typed descriptors shared by capability-gated property controls. */
export interface BooleanPropertyDefinition<Name extends string = string> {
  name: Name;
  label: string;
  description: string;
  defaultValue: boolean;
  resetLabel: string;
}

export interface BooleanPropertyValue {
  value: boolean | null;
  mixed: boolean;
  applicableCount: number;
}
