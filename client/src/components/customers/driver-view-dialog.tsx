import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Driver, Reservation } from "@shared/schema";
import { formatDate, formatPhoneNumber, formatReservationStatus, formatLicensePlate } from "@/lib/format-utils";
import { User, Mail, Phone, CreditCard, Calendar, Car, FileText, Globe } from "lucide-react";

interface DriverViewDialogProps {
  driver: Driver | null;
  activeReservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriverViewDialog({ driver, activeReservation, open, onOpenChange }: DriverViewDialogProps) {
  // Always render the Dialog to prevent unmounting issues
  // Content is only shown when driver is available
  return (
    <Dialog open={open && !!driver} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Driver Details
          </DialogTitle>
          <DialogDescription>
            Complete information for {driver?.displayName || 'Driver'}
          </DialogDescription>
        </DialogHeader>

        {driver && (<div className="space-y-4">
          {/* Basic Information */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg" data-testid="text-driver-display-name">{driver.displayName}</h3>
                <div className="flex gap-2">
                  {driver.isPrimaryDriver && (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200" data-testid="badge-primary-driver">
                      Primary Driver
                    </Badge>
                  )}
                  <Badge
                    className={
                      driver.status === 'active'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                    }
                    data-testid="badge-driver-status-view"
                  >
                    {driver.status}
                  </Badge>
                </div>
              </div>
              
              {(driver.firstName || driver.lastName) && (
                <div className="text-sm text-muted-foreground" data-testid="text-driver-full-name">
                  {driver.firstName} {driver.lastName}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Contact Information
              </h4>
              <Separator />
              
              {driver.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-driver-email-view">{driver.email}</span>
                </div>
              )}
              
              {driver.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-driver-phone-view">{formatPhoneNumber(driver.phone)}</span>
                </div>
              )}
              
              {driver.preferredLanguage && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-driver-language">
                    Preferred Language: {driver.preferredLanguage === 'nl' ? 'Dutch' : 'English'}
                  </span>
                </div>
              )}
              
              {!driver.email && !driver.phone && (
                <div className="text-sm text-muted-foreground">No contact information available</div>
              )}
            </CardContent>
          </Card>

          {/* Driver's License Information */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Driver's License
              </h4>
              <Separator />
              
              {driver.driverLicenseNumber && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium" data-testid="text-driver-license-number-view">{driver.driverLicenseNumber}</span>
                </div>
              )}
              
              {driver.licenseOrigin && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-driver-license-origin">
                    Origin: {driver.licenseOrigin}
                  </span>
                </div>
              )}
              
              {driver.licenseExpiry && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-driver-license-expiry">
                    Expires: {formatDate(driver.licenseExpiry)}
                    {new Date(driver.licenseExpiry) < new Date() && (
                      <Badge className="ml-2 bg-red-100 text-red-800 border-red-200" data-testid="badge-license-expired">Expired</Badge>
                    )}
                  </span>
                </div>
              )}
              
              {driver.licenseFilePath && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">License Document</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <img
                      src={`/${driver.licenseFilePath}`}
                      alt="Driver's License"
                      className="w-full h-auto"
                      data-testid="img-driver-license-preview"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="p-4 text-center text-sm text-muted-foreground">
                              <p>License document preview not available</p>
                              <a href="/${driver.licenseFilePath}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
                                View document
                              </a>
                            </div>
                          `;
                        }
                      }}
                    />
                  </div>
                </div>
              )}
              
              {!driver.driverLicenseNumber && !driver.licenseExpiry && !driver.licenseFilePath && (
                <div className="text-sm text-muted-foreground">No license information available</div>
              )}
            </CardContent>
          </Card>

          {/* Current Vehicle/Reservation */}
          {activeReservation && (
            <Card data-testid="card-active-rental">
              <CardContent className="pt-6 space-y-3">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Current Rental
                </h4>
                <Separator />
                
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium" data-testid="text-active-rental-vehicle">
                    {activeReservation.vehicle && (
                      <>
                        {formatLicensePlate(activeReservation.vehicle.licensePlate)} - {activeReservation.vehicle.brand} {activeReservation.vehicle.model}
                      </>
                    )}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Start Date:</span>
                    <div className="font-medium" data-testid="text-active-rental-start">{formatDate(activeReservation.startDate)}</div>
                  </div>
                  {activeReservation.endDate && (
                    <div>
                      <span className="text-muted-foreground">End Date:</span>
                      <div className="font-medium" data-testid="text-active-rental-end">{formatDate(activeReservation.endDate)}</div>
                    </div>
                  )}
                </div>
                
                <Badge
                  className={
                    activeReservation.status === 'booked'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : activeReservation.status === 'picked_up'
                      ? 'bg-orange-100 text-orange-800 border-orange-200'
                      : activeReservation.status === 'returned'
                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                      : activeReservation.status === 'completed'
                      ? 'bg-green-100 text-green-800 border-green-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }
                  data-testid="badge-active-rental-status"
                >
                  {formatReservationStatus(activeReservation.status)}
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {driver.notes && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Notes
                </h4>
                <Separator />
                <p className="text-sm whitespace-pre-wrap" data-testid="text-driver-notes">{driver.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>)}
      </DialogContent>
    </Dialog>
  );
}
