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
  destinationCache?: DestinationCache;
  domainCache?: DomainCache;
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

export type MigaduDestination = {
  address: string;
  name: string;
  kind: "mailbox" | "identity";
  mailbox: string; // Mailbox address that owns this destination
};

export type DestinationCache = {
  user: string;
  domain: string;
  at: number;
  destinations: MigaduDestination[];
};

export type MigaduDomain = {
  name: string;
  state: string;
};

export type DomainCache = {
  user: string;
  at: number;
  domains: MigaduDomain[];
};

export type CreateAliasInput = {
  localPart: string;
  destinations: string[];
  isInternal?: boolean;
};
