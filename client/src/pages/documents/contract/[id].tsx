import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, FileText, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { queryClient, invalidateRelatedQueries } from '@/lib/queryClient';

// Type for contract data returned from API
interface ContractData {
  contractNumber: string;
  contractDate: string;
  licensePlate: string;
  brand: string;
  model: string;
  chassisNumber: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerPostalCode: string;
  customerPhone: string;
  driverLicense: string;
  startDate: string;
  endDate: string;
  duration: string;
  totalPrice: string;
  vehicleId: number;  // Added to support document cache invalidation
}

export default function ContractViewer() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Load the contract data when the component mounts
  useEffect(() => {
    if (!id) return;

    const fetchContractData = async () => {
      setLoading(true);
      try {
        // Fetch contract data as JSON
        const response = await fetch(`/api/contracts/data/${id}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch contract data: ${response.statusText}`);
        }

        // Parse contract data
        const data = await response.json();
        setContractData(data);

        // Also fetch the PDF version for download
        const pdfResponse = await fetch(`/api/contracts/generate/${id}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/pdf',
          },
        });

        if (pdfResponse.ok) {
          const blob = await pdfResponse.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          
          // Use the invalidateRelatedQueries utility to refresh all related document lists
          if (data.vehicleId) {
            invalidateRelatedQueries('documents');
            invalidateRelatedQueries('vehicles', data.vehicleId);
          }
        }
      } catch (error) {
        console.error('Error fetching contract:', error);
        toast({
          title: 'Error',
          description: 'Failed to load the rental contract. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchContractData();

    // Clean up the object URL when the component unmounts
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [id, toast]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Rental Contract</h1>
        <div className="flex space-x-2">
          <Button 
            onClick={() => setLocation('/reservations')}
            variant="outline"
            className="flex items-center"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reservations
          </Button>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Rental Contract</CardTitle>
          <CardDescription>
            Rental contract for reservation #{id}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading contract...</span>
            </div>
          ) : contractData ? (
            <div className="max-w-3xl mx-auto">
              {/* Company header */}
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold mb-2">Auto Lease LAM</h2>
                <p className="text-gray-600">Kerkweg 47a</p>
                <p className="text-gray-600">3214 VC Zuidland</p>
                <p className="text-gray-600">Tel. 0181-451040</p>
                <p className="text-gray-600">Fax 0181-453386</p>
                <p className="text-gray-600">info@autobedrijflam.nl</p>
                
                <div className="mt-4 text-sm text-gray-500">
                  <p>- ABN AMRO 428621783</p>
                  <p>- RABOBANK 375915605</p>
                  <p>- Ook mogelijk met Creditcard, VISA of MASTERCARD te betalen</p>
                </div>
              </div>
              
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold uppercase border-2 border-gray-300 py-2 px-4 inline-block">
                  Rental Contract
                </h2>
              </div>
              
              <div className="mb-8 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Contract Number:</p>
                  <p className="text-lg">{contractData.contractNumber}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Date:</p>
                  <p className="text-lg">{contractData.contractDate}</p>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* Vehicle information */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">VEHICLE INFORMATION</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">License Plate:</p>
                    <p>{contractData.licensePlate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Brand:</p>
                    <p>{contractData.brand}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Model:</p>
                    <p>{contractData.model}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Chassis Number:</p>
                    <p>{contractData.chassisNumber}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* Customer information */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">CUSTOMER INFORMATION</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Name:</p>
                    <p>{contractData.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Phone:</p>
                    <p>{contractData.customerPhone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Address:</p>
                    <p>{contractData.customerAddress}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">City/Postal Code:</p>
                    <p>{contractData.customerCity} {contractData.customerPostalCode}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Driver License:</p>
                    <p>{contractData.driverLicense}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* Rental period */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">RENTAL PERIOD</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Start Date:</p>
                    <p>{contractData.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">End Date:</p>
                    <p>{contractData.endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Duration:</p>
                    <p>{contractData.duration}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* Pricing */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">RENTAL PRICE</h3>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-xl font-semibold">Total Price: {contractData.totalPrice}</p>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* Terms and conditions */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">TERMS AND CONDITIONS</h3>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
                  <li>The vehicle must be returned in the same condition as at the start of the rental period.</li>
                  <li>The renter is responsible for any damage to the vehicle during the rental period.</li>
                  <li>The vehicle must not be used for illegal purposes.</li>
                  <li>The vehicle must not be driven outside of the Netherlands without prior permission.</li>
                  <li>The vehicle must be returned with the same amount of fuel as at the start of the rental period.</li>
                </ol>
              </div>
              
              <Separator className="my-6" />
              
              {/* Signatures */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">SIGNATURES</h3>
                <div className="grid grid-cols-2 gap-8 mt-6">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-6">Auto Lease LAM:</p>
                    <div className="border-b border-gray-300 h-8"></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-6">Customer:</p>
                    <div className="border-b border-gray-300 h-8"></div>
                  </div>
                </div>
                <div className="mt-8">
                  <p className="text-sm font-medium text-gray-500">Date:</p>
                  <p>{contractData.contractDate}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-lg text-gray-500">
                Failed to load the contract. Please try again.
              </p>
              <Button 
                onClick={() => setLocation(`/reservations/${id}`)}
                variant="outline"
                className="mt-4"
              >
                View Reservation Details
              </Button>
            </div>
          )}
        </CardContent>
        {contractData && pdfUrl && (
          <CardFooter className="flex justify-center gap-4 pt-4">
            <Button 
              onClick={() => window.open(pdfUrl, '_blank')}
              variant="outline"
              className="flex items-center"
            >
              <FileText className="mr-2 h-4 w-4" />
              View PDF Version
            </Button>
            <Button 
              onClick={() => {
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.download = `rental_contract_${id}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              variant="outline"
              className="flex items-center"
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}