import { randomUUID } from "node:crypto";
import {
  createManualPresentationManifest,
  createManualPresentationSlideItems,
  type ManualPresentationDocument
} from "@masico/shared";
import { PrezentaceStudio } from "@/components/presentation/PrezentaceStudio";
import { StudioShell } from "@/components/StudioShell";
import {
  listManualPresentations,
  loadPresentationContexts,
  type PresentationCanteen,
  type PresentationLocation,
  type SavedManualPresentation
} from "@/lib/manual-presentations";
import { getStudioAccessState, roleCanAccess } from "@/lib/studio-auth";

export const dynamic = "force-dynamic";

const demoLocation: PresentationLocation = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Ukázková provozovna"
};
const demoCanteen: PresentationCanteen = {
  id: "00000000-0000-4000-8000-000000000011",
  locationId: demoLocation.id,
  name: "Ukázková jídelna"
};

export default async function PresentationsPage() {
  const access = await getStudioAccessState();
  let locations = [demoLocation];
  let canteens = [demoCanteen];
  let presentations: SavedManualPresentation[] = [];

  if (access.mode === "authenticated") {
    const [contexts, savedPresentations] = await Promise.all([
      loadPresentationContexts(access.orgId),
      listManualPresentations(access.orgId)
    ]);
    locations = contexts.locations;
    canteens = contexts.canteens;
    presentations = savedPresentations;
  }

  const firstCanteen = canteens[0] ?? demoCanteen;
  const locationId = locations.some((location) => location.id === firstCanteen.locationId)
    ? firstCanteen.locationId
    : locations[0]?.id ?? demoLocation.id;
  const initialDocument = createInitialDocument(locationId, firstCanteen.id);
  // Bez skutečné provozovny by uložení skončilo hlubokou chybou RPC —
  // ukládání se vypne a banner vysvětlí proč.
  const hasRealContext = access.mode === "authenticated" && canteens.length > 0;
  const canPersist =
    hasRealContext && roleCanAccess(access.role, ["owner", "admin", "editor"]);
  const persistHint =
    access.mode === "authenticated" && canteens.length === 0
      ? "Pro dlouhodobé uložení nejdřív v nastavení vytvořte provozovnu a jídelnu."
      : "Dlouhodobé verze může ukládat přihlášený vlastník, admin nebo editor.";

  return (
    <StudioShell access={access} activeSection="presentations">
      <PrezentaceStudio
        canPersist={canPersist}
        canteens={canteens}
        initialDocument={initialDocument}
        initialPresentations={presentations}
        locations={locations}
        persistHint={persistHint}
      />
    </StudioShell>
  );
}

function createInitialDocument(
  locationId: string,
  canteenId: string
): ManualPresentationDocument {
  const slideId = randomUUID();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    name: "Nová prezentace",
    presentationDate: todayInPrague(),
    locationId,
    canteenId,
    slides: [
      {
        id: slideId,
        title: "Denní menu",
        baseTemplateId: "masico-intro",
        durationSeconds: 10,
        manifest: createManualPresentationManifest("masico-intro", slideId),
        items: createManualPresentationSlideItems("masico-intro")
      }
    ]
  };
}

function todayInPrague() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
