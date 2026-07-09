import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Home from "./page";

describe("Home", () => {
  it("renders the prediction league dashboard", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Fan Forecast" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("France vs Morocco")[0]).toBeInTheDocument();
    expect(screen.getByText("Private League")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Prediction" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run Demo Replay" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Replay Mode")).toBeInTheDocument();
    expect(screen.getByText(/TxLINE fixture 18209181/i)).toBeInTheDocument();
    expect(screen.getAllByText("16' Goal France")[0]).toBeInTheDocument();
  });

  it("advances the visible TxLINE demo event", async () => {
    const user = userEvent.setup();

    render(<Home />);
    await user.click(screen.getByRole("button", { name: "Next event" }));

    expect(screen.getAllByText("42' Goal Morocco")[0]).toBeInTheDocument();
    expect(
      screen.getByText(/Morocco equalize before halftime/i),
    ).toBeInTheDocument();
  });
});
