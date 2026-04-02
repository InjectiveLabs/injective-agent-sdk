import { describe, it, expect } from "vitest";
import { AgentSdkError, ContractError, StorageError, ValidationError } from "../src/errors.js";

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
});
