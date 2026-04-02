import { describe, it, expect } from "vitest";
import { AgentSdkError, ContractError, SimulationError, StorageError, ValidationError } from "../src/errors.js";

describe("error hierarchy", () => {
  it("ContractError extends AgentSdkError", () => {
    const err = new ContractError("test", "TestRevert");
    expect(err).toBeInstanceOf(AgentSdkError);
    expect(err).toBeInstanceOf(ContractError);
    expect(err.revertReason).toBe("TestRevert");
  });

  it("StorageError extends AgentSdkError", () => {
    const err = new StorageError("upload failed");
    expect(err).toBeInstanceOf(AgentSdkError);
    expect(err).toBeInstanceOf(StorageError);
  });

  it("ValidationError extends AgentSdkError", () => {
    const err = new ValidationError("bad input");
    expect(err).toBeInstanceOf(AgentSdkError);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("SimulationError extends AgentSdkError", () => {
    const err = new SimulationError("sim failed", "EmptyTokenURI", 250_000n);
    expect(err).toBeInstanceOf(AgentSdkError);
    expect(err).toBeInstanceOf(SimulationError);
    expect(err.name).toBe("SimulationError");
    expect(err.revertReason).toBe("EmptyTokenURI");
    expect(err.gasEstimate).toBe(250_000n);
  });

  it("SimulationError works without optional fields", () => {
    const err = new SimulationError("sim failed");
    expect(err.revertReason).toBeUndefined();
    expect(err.gasEstimate).toBeUndefined();
  });
});
