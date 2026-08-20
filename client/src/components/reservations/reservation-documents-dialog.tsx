import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Document } from "@shared/schema";
import { Loader2, FileText, Download, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/format-utils";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { queryClient , invalidateByPrefix } from "@/lib/queryClient";

interface ReservationDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number | null;
  vehicleId: number | null;
}

export function ReservationDocumentsDialog({
  open,
  onOpenChange,
  reservationId,
  vehicleId
}: ReservationDocumentsDialogProps) {
  const { data: documents, isLoading, error } = useQuery<Document[]>({
    queryKey: [`/api/documents/vehicle/${vehicleId}`],
    enabled: open && vehicleId !== null,
  });

  // Filter documents for this specific reservation ONLY (not general vehicle docs)
  const reservationDocuments = documents?.filter(
    doc => doc.reservationId === reservationId
  ) || [];

  // Group documents by type
  const documentsByType = reservationDocuments.reduce((acc, doc) => {
    const type = doc.documentType || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  // Always render the Dialog to prevent unmounting issues
  return (
    <Dialog open={open && vehicleId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Reservation Documents
          </DialogTitle>
          <DialogDescription>
            Documents specifically linked to this reservation (contracts, damage reports, photos)
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading documents...</span>
              </div>
            </div>
          ) : error ? (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-700">
                Failed to load documents. Please try again.
              </AlertDescription>
            </Alert>
          ) : reservationDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500 mb-4">No documents found for this reservation</p>
              {vehicleId && (
                <InlineDocumentUpload 
                  vehicleId={vehicleId}
                  onSuccess={() => {
                    invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                  }}
                >
                  <Button variant="outline">Upload Document</Button>
                </InlineDocumentUpload>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quick Upload */}
              {vehicleId && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-blue-900">Upload New Document</h3>
                        <p className="text-sm text-blue-700">Add contracts, damage reports, or photos</p>
                      </div>
                      <InlineDocumentUpload 
                        vehicleId={vehicleId}
                        onSuccess={() => {
                          invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                        }}
                      >
                        <Button variant="outline" className="bg-white">Upload Document</Button>
                      </InlineDocumentUpload>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Documents by Type */}
              {Object.entries(documentsByType).map(([type, docs]) => (
                <div key={type}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-500" />
                    {type}
                    <span className="text-sm font-normal text-gray-500">({docs.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <Card key={doc.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{doc.fileName}</h4>
                              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                <span>Uploaded: {formatDate(doc.uploadDate)}</span>
                                {doc.createdBy && <span>By: {doc.createdBy}</span>}
                                {doc.reservationId && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                                    Reservation #{doc.reservationId}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`/api/documents/download/${doc.id}`, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(doc.filePath, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
