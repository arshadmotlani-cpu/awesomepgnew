export type PageContext = {
  pathname: string;
  title: string;
  headings: string[];
  buttons: string[];
  links: string[];
  sectionCount: number;
  textPreview: string;
};

export type ElementContext = {
  tag: string;
  text: string;
  role: string | null;
  inputType: string | null;
  ariaLabel: string | null;
};
