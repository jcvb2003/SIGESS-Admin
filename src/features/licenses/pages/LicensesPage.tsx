import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListChecks, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useLicenses } from "../hooks";
import { LicenseMetrics } from "../components/LicenseMetrics";
import { LicenseTable } from "../components/LicenseTable";
import { LicenseGenerator } from "../components/LicenseGenerator";

export default function LicensesPage() {
  const { data: licenses = [], isLoading, refetch, isRefetching } = useLicenses();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Licenças</h1>
          <p className="mt-1 text-muted-foreground">Gerenciamento de licenças</p>
        </div>

        {/* Metrics */}
        <LicenseMetrics licenses={licenses} />

        {/* Tabs */}
        <Tabs defaultValue="licenses" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="licenses" className="gap-2">
              <ListChecks className="h-4 w-4" />
              Licenças
            </TabsTrigger>
            <TabsTrigger value="generate" className="gap-2">
              <KeyRound className="h-4 w-4" />
              Gerar chave
            </TabsTrigger>
          </TabsList>

          {/* Licenses Table */}
          <TabsContent value="licenses">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">Todas as licenças ({licenses.length})</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2" 
                  onClick={() => refetch()}
                  disabled={isRefetching}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
              
              <LicenseTable licenses={licenses} />
            </Card>
          </TabsContent>

          {/* Generate Keys */}
          <TabsContent value="generate">
            <LicenseGenerator />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
