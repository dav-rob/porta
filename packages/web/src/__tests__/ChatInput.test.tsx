import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChatInput } from "../components/ChatInput";

describe("ChatInput", () => {
  const mockOnSend = vi.fn();
  const mockOnStop = vi.fn();
  const mockOnDraftChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
  });

  const defaultProps = {
    onSend: mockOnSend,
    onStop: mockOnStop,
    onDraftChange: mockOnDraftChange,
    isRunning: false,
    draft: "",
    permissionMode: "default" as const,
    onPermissionModeChange: vi.fn(),
  };

  it("renders correctly", () => {
    render(<ChatInput {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Send a message..."),
    ).toBeInTheDocument();
  });

  it("calls onDraftChange when typing", () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Send a message...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    expect(mockOnDraftChange).toHaveBeenCalledWith("hello");
  });

  it("shows and updates the permission mode selector", async () => {
    const onPermissionModeChange = vi.fn();
    render(
      <ChatInput
        {...defaultProps}
        permissionMode="default"
        onPermissionModeChange={onPermissionModeChange}
      />,
    );

    await userEvent.click(screen.getByTitle("Select permission mode"));
    await userEvent.click(screen.getByText("Full access"));

    expect(onPermissionModeChange).toHaveBeenCalledWith("full");
  });

  it("blocks oversized svg attachments before sending", async () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(
      [new Uint8Array(1024 * 1024 + 1)],
      "large.svg",
      { type: "image/svg+xml" },
    );

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("attachment")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Send (Enter)"));

    await waitFor(() => {
      expect(mockOnSend).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "GIF and SVG attachments must stay under",
      );
    });
  });
});
