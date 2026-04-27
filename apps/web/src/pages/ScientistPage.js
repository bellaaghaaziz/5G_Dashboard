import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent, Grid, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
export function ScientistPage() {
    const [metrics, setMetrics] = useState(null);
    useEffect(() => {
        api.get("/scientist/metrics").then((res) => setMetrics(res.data));
    }, []);
    return (_jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { size: { xs: 12 }, children: _jsx(Typography, { variant: "h4", children: "Data Scientist Workspace" }) }), _jsx(Grid, { size: { xs: 12, md: 6 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", children: "Latest Experiment" }), _jsx(Typography, { variant: "h6", children: metrics?.latestExperiment ?? "--" })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 3 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", children: "DSO1 ROC AUC" }), _jsx(Typography, { variant: "h5", children: metrics?.dso1_roc_auc ?? "--" })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 3 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", children: "DSO4 ROC AUC" }), _jsx(Typography, { variant: "h5", children: metrics?.dso4_roc_auc ?? "--" })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 6 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", children: "DSO4 MCC" }), _jsx(Typography, { variant: "h5", children: metrics?.dso4_mcc ?? "--" })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 6 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", children: "DSO4 Threshold" }), _jsx(Typography, { variant: "h5", children: metrics?.dso4_threshold ?? "--" })] }) }) })] }));
}
