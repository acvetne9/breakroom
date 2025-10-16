declare module "synonyms" {
  function synonyms(word: string): Record<string, string[]> | null;
  export = synonyms;
}
