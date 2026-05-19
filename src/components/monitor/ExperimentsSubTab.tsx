import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { FlaskConical } from "lucide-react";

export function ExperimentsSubTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          Experiment Tracker
        </CardTitle>
        <CardDescription>
          Coming in Phase BB — Track experiment runs and hyperparameter sweeps
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">
          This feature will allow you to track and visualize experiment runs
          from your hyperparameter tuning and feature selection pipelines.
        </p>
      </CardContent>
    </Card>
  );
}
