import { z } from "zod";

export const allergenCodeSchema = z.enum([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14"
]);

export type AllergenCode = z.infer<typeof allergenCodeSchema>;

export const allergenCatalog: Array<{
  code: AllergenCode;
  shortName: string;
  fullName: string;
  needsSpecificSource?: boolean;
}> = [
  {
    code: "1",
    shortName: "Lepek",
    fullName: "Obiloviny obsahující lepek",
    needsSpecificSource: true
  },
  { code: "2", shortName: "Korýši", fullName: "Korýši a výrobky z nich" },
  { code: "3", shortName: "Vejce", fullName: "Vejce a výrobky z nich" },
  { code: "4", shortName: "Ryby", fullName: "Ryby a výrobky z nich" },
  { code: "5", shortName: "Arašídy", fullName: "Podzemnice olejná a výrobky z ní" },
  { code: "6", shortName: "Sója", fullName: "Sójové boby a výrobky z nich" },
  { code: "7", shortName: "Mléko", fullName: "Mléko a výrobky z něj včetně laktózy" },
  {
    code: "8",
    shortName: "Skořápkové plody",
    fullName: "Skořápkové plody a výrobky z nich",
    needsSpecificSource: true
  },
  { code: "9", shortName: "Celer", fullName: "Celer a výrobky z něj" },
  { code: "10", shortName: "Hořčice", fullName: "Hořčice a výrobky z ní" },
  { code: "11", shortName: "Sezam", fullName: "Sezamová semena a výrobky z nich" },
  {
    code: "12",
    shortName: "Siřičitany",
    fullName: "Oxid siřičitý a siřičitany"
  },
  { code: "13", shortName: "Vlčí bob", fullName: "Vlčí bob a výrobky z něj" },
  { code: "14", shortName: "Měkkýši", fullName: "Měkkýši a výrobky z nich" }
];

export function getAllergenLabel(code: AllergenCode) {
  const allergen = allergenCatalog.find((item) => item.code === code);
  return allergen ? `${allergen.code}. ${allergen.shortName}` : code;
}
