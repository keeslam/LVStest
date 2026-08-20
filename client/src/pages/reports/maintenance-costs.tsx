import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format-utils";
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
        <p className="text-gray-600">No maintenance cost data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Maintenance Cost Analysis</h1>
          <p className="text-gray-600 mt-1">Compare maintenance costs across vehicles, brands, and categories</p>
        </div>
        <div className="flex gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40" data-testid="select-time-range">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="w-40" data-testid="select-brand">
              <SelectValue placeholder="Brand Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
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
            <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-costs">
              {formatCurrency(costData.totalCosts)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {costData.totalVehicles} vehicles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Per Vehicle</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-per-vehicle">
              {formatCurrency(costData.averageCostPerVehicle)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per vehicle average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Per Km</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-cost-per-km">
              {formatCurrency(costData.averageCostPerKm)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Efficiency metric
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-expenses">
              {costData.vehicleDetails.reduce((sum, v) => sum + v.expenseCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Maintenance records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="brands" data-testid="tab-brands">Brand Comparison</TabsTrigger>
          <TabsTrigger value="vehicles" data-testid="tab-vehicles">Vehicle Details</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cost by Category</CardTitle>
                <CardDescription>Maintenance expense distribution</CardDescription>
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
                      <span className="font-medium">{formatCurrency(cat.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Expensive Vehicles */}
            <Card>
              <CardHeader>
                <CardTitle>Most Expensive Vehicles</CardTitle>
                <CardDescription>Highest maintenance costs</CardDescription>
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
                          <div className="font-bold">{formatCurrency(vehicle.totalCost)}</div>
                          <div className="text-xs text-gray-600">{vehicle.expenseCount} expenses</div>
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
              <CardTitle>Brand Performance Comparison</CardTitle>
              <CardDescription>Compare maintenance costs across different vehicle brands</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={costData.brandComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="brand" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => `Brand: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="totalCost" fill="#3b82f6" name="Total Cost" />
                  <Bar dataKey="avgCost" fill="#10b981" name="Avg Cost Per Vehicle" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Brand Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Brand</th>
                      <th className="text-right p-2">Vehicles</th>
                      <th className="text-right p-2">Total Cost</th>
                      <th className="text-right p-2">Avg Cost/Vehicle</th>
                      <th className="text-right p-2">Efficiency Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.brandComparison
                      .sort((a, b) => a.avgCost - b.avgCost)
                      .map((brand) => {
                        const avgCost = brand.avgCost;
                        const overallAvg = costData.averageCostPerVehicle;
                        const efficiency = avgCost < overallAvg ? 'Excellent' : avgCost < overallAvg * 1.2 ? 'Good' : 'Average';
                        const efficiencyColor = avgCost < overallAvg ? 'text-green-600' : avgCost < overallAvg * 1.2 ? 'text-blue-600' : 'text-orange-600';
                        
                        return (
                          <tr key={brand.brand} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{brand.brand}</td>
                            <td className="text-right p-2">{brand.vehicleCount}</td>
                            <td className="text-right p-2">{formatCurrency(brand.totalCost)}</td>
                            <td className="text-right p-2">{formatCurrency(brand.avgCost)}</td>
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
              <CardTitle>Individual Vehicle Analysis</CardTitle>
              <CardDescription>Detailed cost breakdown per vehicle</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">License Plate</th>
                      <th className="text-left p-2">Brand/Model</th>
                      <th className="text-right p-2">Total Cost</th>
                      <th className="text-right p-2">Cost/Km</th>
                      <th className="text-right p-2">Mileage</th>
                      <th className="text-right p-2">Expenses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.vehicleDetails
                      .sort((a, b) => b.totalCost - a.totalCost)
                      .map((vehicle) => (
                        <tr key={vehicle.vehicleId} className="border-b hover:bg-gray-50" data-testid={`row-vehicle-${vehicle.vehicleId}`}>
                          <td className="p-2 font-medium">{vehicle.licensePlate}</td>
                          <td className="p-2">{vehicle.brand} {vehicle.model}</td>
                          <td className="text-right p-2">{formatCurrency(vehicle.totalCost)}</td>
                          <td className="text-right p-2">{formatCurrency(vehicle.costPerKm)}</td>
                          <td className="text-right p-2">{vehicle.currentMileage?.toLocaleString() || 'N/A'} km</td>
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
              <CardTitle>Monthly Cost Trends</CardTitle>
              <CardDescription>Track maintenance spending over time</CardDescription>
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
                    name="Monthly Cost"
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
