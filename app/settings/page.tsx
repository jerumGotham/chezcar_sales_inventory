"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function SettingsPage() {
  const [isEditingCompany, setIsEditingCompany] = useState(false);

  const [company, setCompany] = useState({
    name: "Chezcar Accessories",
    address: "Quezon City",
    contact: "0917-000-0000",
    description: "",
  });

  const [payments, setPayments] = useState(["Cash", "Card", "Bank Transfer"]);
  const [newPayment, setNewPayment] = useState("");

  const [categories, setCategories] = useState([
    "Interior",
    "Exterior",
    "Electronics",
  ]);
  const [newCategory, setNewCategory] = useState("");

  return (
    <PageShell
      title="Settings"
      subtitle="Manage system configuration, company profile, and master data."
      actions={<Button>Save Changes</Button>}
    >
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* ================= COMPANY ================= */}
        <TabsContent value="company">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Company Details</h3>
                <Button
                  variant="outline"
                  onClick={() => setIsEditingCompany(!isEditingCompany)}
                >
                  {isEditingCompany ? "Cancel" : "Edit"}
                </Button>
              </div>

              <Input
                disabled={!isEditingCompany}
                value={company.name}
                onChange={(e) =>
                  setCompany({ ...company, name: e.target.value })
                }
              />
              <Input
                disabled={!isEditingCompany}
                value={company.address}
                onChange={(e) =>
                  setCompany({ ...company, address: e.target.value })
                }
              />
              <Input
                disabled={!isEditingCompany}
                value={company.contact}
                onChange={(e) =>
                  setCompany({ ...company, contact: e.target.value })
                }
              />

              <Textarea
                disabled={!isEditingCompany}
                value={company.description}
                onChange={(e) =>
                  setCompany({ ...company, description: e.target.value })
                }
                placeholder="Company description"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= PAYMENTS ================= */}
        <TabsContent value="payments">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Payment Types</h3>

              <div className="flex gap-2">
                <Input
                  placeholder="Add payment type"
                  value={newPayment}
                  onChange={(e) => setNewPayment(e.target.value)}
                />
                <Button
                  onClick={() => {
                    if (!newPayment) return;
                    setPayments([...payments, newPayment]);
                    setNewPayment("");
                  }}
                >
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {payments.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span>{p}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPayments(payments.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= CATEGORIES ================= */}
        <TabsContent value="categories">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">Product Categories</h3>

              <div className="flex gap-2">
                <Input
                  placeholder="Add category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button
                  onClick={() => {
                    if (!newCategory) return;
                    setCategories([...categories, newCategory]);
                    setNewCategory("");
                  }}
                >
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {categories.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span>{c}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setCategories(categories.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
