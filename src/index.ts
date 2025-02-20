import { Trial } from "./types";

// A simple function to add two numbers
export const add = (a: number, b: number): number => {
  return a + b;
};

export const getTrial = (): Trial => {
  return {
    id: "1",
    name: "Trial 1",
    description: "This is a trial",
    startDate: "2021-01-01",
    endDate: "2021-01-31",
    status: "active",
  };
}