import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCmsListManager, type ListField } from "./AdminCmsListManager";

const reviewFields: ListField[] = [
  { key: "name", label: "Name", type: "text", translatable: false },
  { key: "text", label: "Review", type: "textarea", translatable: true },
  { key: "rating", label: "Stars", type: "number", translatable: false },
  { key: "context", label: "Context", type: "text", translatable: true },
  { key: "date", label: "Date", type: "text", translatable: false },
];

const signatureFields: ListField[] = [
  { key: "title", label: "Title", type: "text", translatable: true },
  { key: "benefit", label: "Benefit", type: "textarea", translatable: true },
  { key: "image", label: "Image", type: "image", translatable: false },
  { key: "category", label: "Booking category", type: "text", translatable: false },
];

const rateFields: ListField[] = [
  { key: "price", label: "Price", type: "text", translatable: false },
  { key: "label", label: "Label (e.g. 1 hour)", type: "text", translatable: true },
];

const featureFields: ListField[] = [
  { key: "value", label: "Feature", type: "text", translatable: true },
];

export function AdminHomeLists() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Home &amp; Page Lists</h2>
        <p className="text-sm text-muted-foreground font-body">
          Add, edit, remove and reorder cards and list items across the site. English + Spanish. Changes go live on save.
        </p>
      </div>

      <Tabs defaultValue="google">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="google">Google Reviews</TabsTrigger>
          <TabsTrigger value="tripadvisor">Tripadvisor</TabsTrigger>
          <TabsTrigger value="signature">Signature Experiences</TabsTrigger>
          <TabsTrigger value="studio">Studio Rental</TabsTrigger>
        </TabsList>

        <TabsContent value="google" className="mt-4">
          <AdminCmsListManager
            title="Google Reviews"
            description="Cards shown in the Google Reviews section on the homepage."
            section="googleReviews"
            arrayKey="reviews"
            fields={reviewFields}
            itemNoun="review"
          />
        </TabsContent>

        <TabsContent value="tripadvisor" className="mt-4">
          <AdminCmsListManager
            title="Tripadvisor Testimonials"
            description="Cards shown in the Tripadvisor testimonials section on the homepage."
            section="testimonials"
            arrayKey="reviews"
            fields={reviewFields}
            itemNoun="review"
          />
        </TabsContent>

        <TabsContent value="signature" className="mt-4">
          <AdminCmsListManager
            title="Signature Experiences"
            description="The featured experience cards on the homepage. 'Booking category' links the Book button to that treatment category."
            section="signatureExperiences"
            arrayKey="items"
            fields={signatureFields}
            itemNoun="experience"
          />
        </TabsContent>

        <TabsContent value="studio" className="mt-4 space-y-8">
          <AdminCmsListManager
            title="Studio Rental — Features"
            description="The amenities list on the Rent the Studio page."
            section="studioRental"
            arrayKey="features"
            fields={featureFields}
            stringItems
            itemNoun="feature"
          />
          <AdminCmsListManager
            title="Studio Rental — Rates"
            description="The pricing tiers on the Rent the Studio page."
            section="studioRental"
            arrayKey="rates"
            fields={rateFields}
            itemNoun="rate"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
