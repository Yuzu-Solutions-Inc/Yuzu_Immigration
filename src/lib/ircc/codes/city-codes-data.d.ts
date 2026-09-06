export type CityCodeTables = {
  aliases: Record<string, string>;
  labels: Record<string, string>;
};

declare const cityCodes: CityCodeTables;
export default cityCodes;
