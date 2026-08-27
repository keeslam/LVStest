import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Wrench, Car, Calendar } from "lucide-react";

interface MaintenanceCostData {
  totalCosts: number;
  averageCostPerVehicle: number;
  averageCostPerKm: number;
  totalVehicles: number;
  categoryBreakdown: Array<{category: string, amount: number, percentage: number}>;
  brandComparison: Array<{brand: string, totalCost: number, avgCost: number, vehicleCount: number}>;
  vehicleDetails: Array<{
    vehicleId: number;
    licensePlate: string;
    brand: string;
    model: string;
    totalCost: number;
    costPerKm: number;
    currentMileage: number;
    expenseCount: number;
  }>;
  monthlyTrend: Array<{month: string, amount: number}>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function MaintenanceCostsPage() {
  const { t } = useTranslation("reports");
  const [timeRange, setTimeRange] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");

  // Fetch maintenance cost analysis data
  const { data: costData, isLoading } = useQuery<MaintenanceCostData>({
    queryKey: ['/api/reports/maintenance-costs', timeRange, selectedBrand],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!costData) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">{t('maintenanceCostsPage.noDataAvailable')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('maintenanceCostsPage.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('maintenanceCostsPage.pageDescription')}</p>
        </div>
        <div className="flex gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40" data-testid="select-time-range">
              <SelectValue placeholder={t('maintenanceCostsPage.timeRangePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('maintenanceCostsPage.allTime')}</SelectItem>
              <SelectItem value="year">{t('maintenanceCostsPage.lastYear')}</SelectItem>
              <SelectItem value="6months">{t('maintenanceCostsPage.last6Months')}</SelectItem>
              <SelectItem value="3months">{t('maintenanceCostsPage.last3Months')}</SelectItem>
              <SelectItem value="month">{t('maintenanceCostsPage.lastMonth')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="w-40" data-testid="select-brand">
              <SelectValue placeholder={t('maintenanceCostsPage.brandFilterPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('maintenanceCostsPage.allBrands')}</SelectItem>
              {costData.brandComparison.map(brand => (
                <SelectItem key={brand.brand} value={brand.brand}>{brand.brand}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('maintenanceCostsPage.totalCostsLabel')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-costs">
              {<Price value={costData.totalCosts} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('maintenanceCostsPage.acrossVehicles', { count: costData.totalVehicles })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('maintenanceCostsPage.avgPerVehicleLabel')}</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-per-vehicle">
              {<Price value={costData.averageCostPerVehicle} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('maintenanceCostsPage.perVehicleAverage')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('maintenanceCostsPage.costPerKmLabel')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-cost-per-km">
              {<Price value={costData.averageCostPerKm} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('maintenanceCostsPage.efficiencyMetric')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('maintenanceCostsPage.totalExpensesLabel')}</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-expenses">
              {costData.vehicleDetails.reduce((sum, v) => sum + v.expenseCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('maintenanceCostsPage.maintenanceRecords')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">{t('maintenanceCostsPage.overviewTab')}</TabsTrigger>
          <TabsTrigger value="brands" data-testid="tab-brands">{t('maintenanceCostsPage.brandComparisonTab')}</TabsTrigger>
          <TabsTrigger value="vehicles" data-testid="tab-vehicles">{t('maintenanceCostsPage.vehicleDetailsTab')}</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">{t('maintenanceCostsPage.trendsTab')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>{t('maintenanceCostsPage.costByCategoryTitle')}</CardTitle>
                <CardDescription>{t('maintenanceCostsPage.costByCategoryDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={costData.categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.category} (${entry.percentage.toFixed(1)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {costData.categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {costData.categoryBreakdown.map((cat, index) => (
                    <div key={cat.category} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{backgroundColor: COLORS[index % COLORS.length]}}
                        />
                        <span>{cat.category}</span>
                      </div>
                      <span className="font-medium">{<Price value={cat.amount} />}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Expensive Vehicles */}
            <Card>
              <CardHeader>
                <CardTitle>{t('maintenanceCostsPage.mostExpensiveVehiclesTitle')}</CardTitle>
                <CardDescription>{t('maintenanceCostsPage.mostExpensiveVehiclesDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {costData.vehicleDetails
                    .sort((a, b) => b.totalCost - a.totalCost)
                    .slice(0, 10)
                    .map((vehicle, index) => (
                      <div key={vehicle.vehicleId} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{vehicle.licensePlate}</div>
                            <div className="text-sm text-gray-600">{vehicle.brand} {vehicle.model}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{<Price value={vehicle.totalCost} />}</div>
                          <div className="text-xs text-gray-600">{t('maintenanceCostsPage.expenseCount', { count: vehicle.expenseCount })}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Brand Comparison Tab */}
        <TabsContent value="brands" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('maintenanceCostsPage.brandPerformanceTitle')}</CardTitle>
              <CardDescription>{t('maintenanceCostsPage.brandPerformanceDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={costData.brandComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="brand" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => t('maintenanceCostsPage.brandTooltipLabel', { label })}
                  />
                  <Legend />
                  <Bar dataKey="totalCost" fill="#3b82f6" name={t('maintenanceCostsPage.totalCostLegend')} />
                  <Bar dataKey="avgCost" fill="#10b981" name={t('maintenanceCostsPage.avgCostPerVehicleLegend')} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Brand Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t('maintenanceCostsPage.brandStatisticsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">{t('maintenanceCostsPage.brandColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.vehiclesColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.totalCostColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.avgCostPerVehicleColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.efficiencyRatingColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.brandComparison
                      .sort((a, b) => a.avgCost - b.avgCost)
                      .map((brand) => {
                        const avgCost = brand.avgCost;
                        const overallAvg = costData.averageCostPerVehicle;
                        const efficiency = avgCost < overallAvg ? t('maintenanceCostsPage.efficiencyExcellent') : avgCost < overallAvg * 1.2 ? t('maintenanceCostsPage.efficiencyGood') : t('maintenanceCostsPage.efficiencyAverage');
                        const efficiencyColor = avgCost < overallAvg ? 'text-green-600' : avgCost < overallAvg * 1.2 ? 'text-blue-600' : 'text-orange-600';
                        
                        return (
                          <tr key={brand.brand} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{brand.brand}</td>
                            <td className="text-right p-2">{brand.vehicleCount}</td>
                            <td className="text-right p-2">{<Price value={brand.totalCost} />}</td>
                            <td className="text-right p-2">{<Price value={brand.avgCost} />}</td>
                            <td className={`text-right p-2 font-medium ${efficiencyColor}`}>{efficiency}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicle Details Tab */}
        <TabsContent value="vehicles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('maintenanceCostsPage.individualVehicleAnalysisTitle')}</CardTitle>
              <CardDescription>{t('maintenanceCostsPage.individualVehicleAnalysisDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">{t('maintenanceCostsPage.licensePlateColumn')}</th>
                      <th className="text-left p-2">{t('maintenanceCostsPage.brandModelColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.totalCostColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.costPerKmColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.mileageColumn')}</th>
                      <th className="text-right p-2">{t('maintenanceCostsPage.expensesColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.vehicleDetails
                      .sort((a, b) => b.totalCost - a.totalCost)
                      .map((vehicle) => (
                        <tr key={vehicle.vehicleId} className="border-b hover:bg-gray-50" data-testid={`row-vehicle-${vehicle.vehicleId}`}>
                          <td className="p-2 font-medium">{vehicle.licensePlate}</td>
                          <td className="p-2">{vehicle.brand} {vehicle.model}</td>
                          <td className="text-right p-2">{<Price value={vehicle.totalCost} />}</td>
                          <td className="text-right p-2">{<Price value={vehicle.costPerKm} />}</td>
                          <td className="text-right p-2">{vehicle.currentMileage?.toLocaleString() || t('maintenanceCostsPage.notAvailable')} km</td>
                          <td className="text-right p-2">{vehicle.expenseCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('maintenanceCostsPage.monthlyCostTrendsTitle')}</CardTitle>
              <CardDescription>{t('maintenanceCostsPage.monthlyCostTrendsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={costData.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name={t('maintenanceCostsPage.monthlyCostLegend')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
