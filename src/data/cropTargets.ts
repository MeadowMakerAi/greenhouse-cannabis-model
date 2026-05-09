export interface CropTarget {
  id: string;
  label: string;
  targetDLI: number;
  targetTopCanopyPPFD: number;
  description: string;
}

export const cropTargets: Record<string, CropTarget> = {
  minimumFlower: {
    id: "minimumFlower",
    label: "Minimum high-quality flower",
    targetDLI: 30,
    targetTopCanopyPPFD: 700,
    description: "Lower bound for premium-aspirant flower in greenhouse.",
  },
  commercialPremium: {
    id: "commercialPremium",
    label: "Premium commercial flower",
    targetDLI: 40,
    targetTopCanopyPPFD: 925,
    description: "Mainstream premium-quality DLI target with disciplined VPD.",
  },
  co2Enhanced: {
    id: "co2Enhanced",
    label: "CO₂-enhanced aggressive flower",
    targetDLI: 50,
    targetTopCanopyPPFD: 1150,
    description:
      "Requires CO₂ enrichment plus tight VPD, irrigation, nutrition, and cooling control.",
  },
};
