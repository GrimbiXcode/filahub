import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold">404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Diese Seite gibt es nicht (mehr).
          </p>
          <Button asChild className="w-full">
            <Link to="/">Zur Materialübersicht</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
