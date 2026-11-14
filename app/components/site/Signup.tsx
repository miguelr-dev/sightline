"use client";

import { useState } from "react";

// Early-access signup. Not wired to an email service yet: it only confirms on screen.
export function Signup() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(
          /.+@.+\..+/.test(email)
            ? "Thanks. We'll email you when there's news."
            : "Please enter an email address, like you@example.com.",
        );
      }}
    >
      <div className="signup">
        <label htmlFor="email" className="sr">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMsg("");
          }}
        />
        <button className="btn btn-g" type="submit">
          Notify me
        </button>
      </div>
      <p role="status" style={{ minHeight: 28, margin: "14px 0 0", color: "#B8B8B8" }}>
        {msg}
      </p>
    </form>
  );
}
