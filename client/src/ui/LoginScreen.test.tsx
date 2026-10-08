import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

afterEach(() => vi.unstubAllGlobals());

describe("LoginScreen", () => {
  it("prefills the local homeserver", () => {
    render(<LoginScreen onLogin={() => undefined} />);
    expect(screen.getByLabelText("Homeserver")).toHaveValue("http://localhost:8008");
  });

  it("shows a readable error for wrong credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ errcode: "M_FORBIDDEN", error: "Invalid password" }), {
            status: 403,
          }),
      ),
    );
    render(<LoginScreen onLogin={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Wrong username or password."));
  });

  it("passes the session to onLogin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ user_id: "@alice:localhost", access_token: "tok", device_id: "DEV" }),
            {
              status: 200,
            },
          ),
      ),
    );
    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "assignment" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith({
        homeserver: "http://localhost:8008",
        userId: "@alice:localhost",
        accessToken: "tok",
        deviceId: "DEV",
      }),
    );
  });
});
