// components/pix-payment.tsx
"use client";
import {
  useRef,
  useState,
  useMemo,
  ChangeEvent,
  DragEvent,
} from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, UploadCloud, Image as ImageIcon, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface PixPaymentProps {
  amount: number;
  orderId: string;   // txid
  pixPayload: string;
}

export function PixPayment({ amount, orderId, pixPayload }: PixPaymentProps) {
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const PIX_KEY = "11398391441";
  const ACCOUNT_HOLDER = "IGOR WAGNER";
  const BANK_NAME = "Banco Inter";

  const isPDF = useMemo(
    () =>
      proofFile
        ? proofFile.type === "application/pdf" ||
          proofFile.name.toLowerCase().endsWith(".pdf")
        : false,
    [proofFile]
  );

  const handleCopy = async (text: string, isKey = false) => {
    await navigator.clipboard.writeText(text);
    if (isKey) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadQRCode = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    const img = new Image();
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const pngUrl = canvas
          .toDataURL("image/png")
          .replace("image/png", "image/octet-stream");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `pix-qrcode-${orderId}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileChoose = async (file?: File) => {
    if (!file) return;
    setProofFile(file);
    if (file.type.startsWith("image/")) {
      const preview = await fileToBase64(file);
      setProofPreview(preview);
    } else {
      setProofPreview("");
    }
  };

  const onInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileChoose(f);
  };

  const onDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileChoose(f);
  };

  const router = useRouter();

  const handleSendProof = async () => {
    if (!proofFile) {
      toast.error("Envie o comprovante para confirmar o pedido.");
      return;
    }

    try {
      setIsSending(true);
      const proofBase64 = await fileToBase64(proofFile);

      const res = await fetch("/api/encomendas/upload-comprovante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid: orderId,
          comprovanteBase64: proofBase64,
          valorPago: amount,
        }),
      });

      if (!res.ok) {
        toast.error("Erro ao enviar comprovante. Tente novamente.");
        return;
      }

      toast.success("Comprovante enviado! Agora é só aguardar a confirmação.");
      router.push("/final");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível enviar o comprovante. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="border-pink-200 bg-white/95 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-pink-700">
            Pagamento via PIX
          </CardTitle>
          <p className="text-sm text-slate-500">
            Pedido #{orderId}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Valor */}
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-1">
              Valor a pagar agora
            </p>
            <p className="text-4xl font-bold text-pink-700">
              R$ {amount.toFixed(2)}
            </p>
          </div>

          <Separator className="bg-pink-100" />

          {/* Dados bancários */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">
              Dados Bancários
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="bg-pink-50 border border-pink-100 rounded-lg p-3">
                <Label className="text-xs text-slate-500">Banco</Label>
                <p className="font-medium text-slate-900">{BANK_NAME}</p>
              </div>
              <div className="bg-pink-50 border border-pink-100 rounded-lg p-3">
                <Label className="text-xs text-slate-500">Titular</Label>
                <p className="font-medium text-slate-900">{ACCOUNT_HOLDER}</p>
              </div>
              <div className="sm:col-span-2 bg-pink-50 border border-pink-100 rounded-lg p-3">
                <Label className="text-xs text-slate-500">Chave PIX</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="break-all font-medium text-slate-900 flex-1">
                    {PIX_KEY}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 hover:bg-pink-100"
                    onClick={() => handleCopy(PIX_KEY, true)}
                  >
                    {copiedKey ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-700" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-pink-100" />

          {/* PIX copia e cola + QR */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">
              PIX
            </h3>
            <div className="flex flex-col gap-6 sm:flex-row">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-slate-500">
                  Copia e Cola
                </Label>
                <div className="bg-pink-50 border border-pink-100 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <p className="break-all font-mono text-xs text-slate-800 flex-1">
                      {pixPayload}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 hover:bg-pink-100"
                      onClick={() => handleCopy(pixPayload)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-slate-700" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="bg-white p-3 rounded-lg border border-pink-100">
                  <QRCodeSVG
                    value={pixPayload}
                    size={160}
                    level="H"
                    includeMargin
                    ref={svgRef}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs sm:text-sm border-pink-200 text-pink-700 hover:bg-pink-50"
                  onClick={downloadQRCode}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar QR Code
                </Button>
              </div>
            </div>
          </div>

          <Separator className="bg-pink-100" />

          {/* Upload comprovante */}
          <div className="space-y-3">
            <Label className="text-xs text-slate-500">
              Comprovante de Pagamento (obrigatório)
            </Label>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={[
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed p-4 transition",
                isDragging
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-pink-200 bg-pink-50 hover:bg-pink-100",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-white/70 p-2">
                  {isPDF ? (
                    <FileText className="h-5 w-5 text-pink-600" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-pink-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-slate-800 font-medium">
                    Arraste e solte o arquivo aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-slate-500">
                    PNG, JPG ou PDF — até ~10MB
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-md bg-pink-600/10 px-3 py-2 text-xs font-medium text-pink-700">
                <UploadCloud className="mr-1 inline-block h-4 w-4" />
                Upload
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onInputChange}
              />
            </label>

            {proofFile && (
              <div className="rounded-lg border border-pink-100 bg-pink-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-white/70 p-2">
                      {isPDF ? (
                        <FileText className="h-5 w-5 text-pink-600" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-pink-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {proofFile.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  {!isPDF && proofPreview && (
                    <img
                      src={proofPreview}
                      alt="Prévia do comprovante"
                      className="h-16 w-16 rounded-md object-cover ring-1 ring-pink-200"
                    />
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={handleSendProof}
              disabled={!proofFile || isSending}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white"
            >
              {isSending
                ? "Enviando comprovante..."
                : "Enviar comprovante e finalizar etapa"}
            </Button>
          </div>

          <div className="bg-pink-50 border border-pink-100 rounded-lg p-4 space-y-2">
            <p className="font-semibold text-pink-700">Instruções:</p>
            <ol className="text-sm space-y-1 list-decimal list-inside text-slate-700">
              <li>Abra o app do seu banco.</li>
              <li>Escolha pagar com PIX (QR Code ou Copia e Cola).</li>
              <li>Escaneie o código ou cole o código copiado.</li>
              <li>Depois do pagamento, envie o comprovante acima.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
