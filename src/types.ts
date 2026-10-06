export type MigaduConfig = {
  user: string;
  token: string;
  domain: string; // Primary Migadu domain used for API calls
  domains: string[]; // Alias domains used only for clipboard output
  defaultAliasDomain: string | null; // Alias domain selected for copy-to-clipboard
};

export type MigaduStorage = {
  migadu?: Partial<MigaduConfig>;
  aliasCache?: AliasCache;
  aliasDomainSelection?: {
    user: string;
    domain: string;
    value: string | null;
  } | null;
};

export type MigaduAlias = {
  address: string;
  local_part: string;
  destinations: string[];
  is_internal?: boolean;
};

export type AliasCache = {
  user: string;
  domain: string;
  at: number;
  aliases: MigaduAlias[];
};

export type CreateAliasInput = {
  localPart: string;
  destinationsCsv: string; // "a@dominio.com,b@dominio.com"
  isInternal?: boolean;
};
