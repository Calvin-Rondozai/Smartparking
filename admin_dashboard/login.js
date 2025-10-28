public class MultiViewGeometry {
    // Convert 3D world point to 2D image point using simple pinhole camera model
    public static double[] project(double[] P, double f) {
        double x = (f * P[0]) / P[2];
        double y = (f * P[1]) / P[2];
        return new double[]{x, y};
    }

    // Very simple triangulation: estimates depth from two camera views
    public static double[] triangulate(double[] p1, double[] p2, double baseline, double f) {
        double disparity = p1[0] - p2[0];
        double Z = (f * baseline) / disparity;
        double X = (p1[0] * Z) / f;
        double Y = (p1[1] * Z) / f;
        return new double[]{X, Y, Z};
    }

    public static void main(String[] args) {
        double[] P = {2, 1, 5}; // real 3D point
        double f = 100;         // focal length
        double baseline = 0.5;  // distance between two cameras

        double[] p1 = project(P, f);               // Camera 1
        double[] p2 = {p1[0] - 5, p1[1]};          // Shift for Camera 2
        double[] result = triangulate(p1, p2, baseline, f);

        System.out.println("Estimated 3D Point: X=" + result[0] +
                           " Y=" + result[1] + " Z=" + result[2]);
    }
}
