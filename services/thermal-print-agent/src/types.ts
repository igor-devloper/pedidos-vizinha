export type PrintJob = {
  id: string;
  orderId: string;
  code: string;
  reason: "auto-accepted" | "manual";
  createdAt: string;
  status: "queued";
  receipt: string;
  printer: {
    model: string;
    widthMm: number;
    dpi: number;
    commandSet: string;
  };
};
