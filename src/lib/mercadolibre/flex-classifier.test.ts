import { describe, expect, it } from "vitest";
import { classifyFlex, isFlexShipment, FLEX_RULE_VERSION } from "./flex-classifier";

describe("classifyFlex", () => {
  it("clasifica Flex por logistic_type self_service", () => {
    const result = classifyFlex({ logistic_type: "self_service", tags: [], mode: "me2" });
    expect(result.isFlex).toBe(true);
    expect(result.reason).toBe("logistic_type_self_service");
    expect(result.ruleVersion).toBe(FLEX_RULE_VERSION);
  });

  it("clasifica Flex por tag self_service_in aunque falte logistic_type", () => {
    const result = classifyFlex({ tags: ["self_service_in"], mode: "me2" });
    expect(result.isFlex).toBe(true);
    expect(result.reason).toBe("tag_self_service");
  });

  it("es insensible a mayúsculas", () => {
    expect(isFlexShipment({ logistic_type: "SELF_SERVICE", tags: [] })).toBe(true);
    expect(isFlexShipment({ tags: ["Self_Service_Out"] })).toBe(true);
  });

  it("no clasifica cross_docking como Flex", () => {
    const result = classifyFlex({ logistic_type: "cross_docking", tags: [], mode: "me2" });
    expect(result.isFlex).toBe(false);
    expect(result.reason).toBe("no_flex_signals");
  });

  it("no clasifica fulfillment como Flex", () => {
    expect(isFlexShipment({ logistic_type: "fulfillment", tags: ["fbm"] })).toBe(false);
  });

  it("marca insufficient_data cuando no hay señales", () => {
    const result = classifyFlex({ tags: [] });
    expect(result.isFlex).toBe(false);
    expect(result.reason).toBe("insufficient_data");
  });

  it("un tag no relacionado no dispara Flex", () => {
    expect(isFlexShipment({ logistic_type: "drop_off", tags: ["printed"] })).toBe(false);
  });
});
